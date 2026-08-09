/**
 * Bingo 18 – Stats Accumulator (pure, in-memory, DELTA-ONLY)
 *
 * Gom **phần THAY ĐỔI** của 1 tick worker cho 1 kỳ, rồi xuất ra delta để repo ghi bằng
 * `$inc`. Tách pure khỏi repo/worker để dễ test và đọc.
 *
 * ## Delta-only: khác gì bản trước ($set full-doc)?
 *
 * Bản trước giữ **full state** của kỳ trong RAM: `seed()` đọc stats doc baseline → cộng
 * entries mới → `$set` overwrite toàn doc mỗi tick. Ba khiếm khuyết gốc (mẫu Keno
 * `p2-01-stats-worker-scale-hardening.plan.md` §3.5):
 *
 * 1. **Buộc đọc baseline mỗi tick** — cả doc × D kỳ × N lần/phút, kể cả khi không ai cược.
 * 2. **Drift không tự sửa** — `topAccounts` tích luỹ chỉ lưu top-K nên seed lại bị khuyết
 *    phần rơi ngoài K; account đó lần sau tính lại từ 0 (xử lý ở p0-03 — collection phụ).
 * 3. **Cần recompute lúc đóng bán** để "chữa lành" số sai → 2 thuật toán song song cho
 *    cùng 1 con số, phải bảo trì và giữ khớp nhau mãi mãi.
 *
 * Delta-only xoá cả ba: không đọc baseline (nên không thể drift), `$inc` cộng dồn nguyên tử,
 * và không còn nhu cầu recompute → **1 thuật toán duy nhất**.
 *
 * `topPotential` VẪN gom ở đây vì `potentialWin` là metric **BẤT BIẾN per-entry** (exact
 * max over 216 outcome) — entry rớt khỏi top-K thì mãi mãi không cần quay lại, nên top-K an
 * toàn (Mongo `$push` + `$sort` + `$slice` lo phần cắt). `topAccounts` (tích luỹ) KHÔNG gom
 * theo kiểu top-K in-doc — accumulator gom Δ THÔ theo account (`accounts` Map,
 * `drainAccountDeltas()`) để repo `$inc` vào collection phụ `bingo18_draw_account_stats`,
 * top-K chỉ derive lúc ĐỌC (`sort({amount:-1}).limit(K)`) — xem `account-stats-repo.ts`.
 *
 * ## Phân nhánh board → bucket
 *
 * Mỗi board cộng vào ĐÚNG 1 bucket — cùng cách phân nhánh playType với
 * `settle-entries.ts` (dùng member `Bingo18PlayType`, KHÔNG string trần):
 *   singleNum[number] · doubleMatch[number] · tripleMatch.specific[number]/.any
 *   · sumTotal[sum] · bigSmallDraw[bet].
 *
 * Bucket delta khởi LAZY trong Map — chỉ tồn tại khi có board thực sự chạm tới, KHÔNG
 * seed đủ 38 bucket rồi lọc sau (F2-a) — tránh tốn RAM + vòng lặp vô ích mỗi tick × D kỳ.
 */

import type { Bingo18BucketStat, Bingo18TopPotential, TenantBettingStat } from "@megawin/game-bingo18/entities";
import { Bingo18PlayType, Bingo18TripleKind } from "@megawin/game-bingo18/entities";
import type { Bingo18PrizeSet } from "@megawin/game-bingo18/rules";
import { computeBingo18EntryPotentialWin } from "@megawin/game-bingo18/rules";

import type { AccountStatsDelta, DrawStatsDelta, EntryBoardForStats, EntryForStats } from "../../infras/repos/types";

/** Prize config + ngưỡng cược lớn gom lại — truyền 1 lần cho accumulator. */
export interface PrizeContext {
  /** Mệnh giá fallback khi entry thiếu unitPrice snapshot (data cũ). */
  unitPrice: number;
  /** Bảng giải từ GlobalConfig — input `computeBingo18EntryPotentialWin`. */
  prizes: Bingo18PrizeSet;
  /** Ngưỡng cược lớn (VND) — entry.amount ≥ ngưỡng ⇒ tính vào largeBetCount. */
  largeBetAmount: number;
}

function emptyBucket(): Bingo18BucketStat {
  return { amount: 0, sets: 0, entries: 0 };
}

/** Delta 1 account trong tick (chưa gắn drawId). */
interface AccountDeltaState {
  username: string;
  amount: number;
  entries: number;
  sets: number;
}

export class Bingo18DrawStatsAccumulator {
  private revenue = 0;
  private entries = 0;
  private sets = 0;
  private commission = 0;
  private largeBetCount = 0;

  /** Δ bucket lazy — chỉ set key khi board thực sự chạm tới (F2-a). */
  private readonly singleNum = new Map<string, Bingo18BucketStat>();
  private readonly doubleMatch = new Map<string, Bingo18BucketStat>();
  private readonly tripleSpecific = new Map<string, Bingo18BucketStat>();
  private tripleAny: Bingo18BucketStat | undefined;
  private readonly sumTotal = new Map<string, Bingo18BucketStat>();
  private big: Bingo18BucketStat | undefined;
  private draw: Bingo18BucketStat | undefined;
  private small: Bingo18BucketStat | undefined;

  private readonly byTenant = new Map<string, TenantBettingStat>();
  private readonly accounts = new Map<string, AccountDeltaState>();
  private readonly potentials: Bingo18TopPotential[] = [];

  readonly drawId: string;
  private readonly prize: PrizeContext;

  constructor(drawId: string, prize: PrizeContext) {
    this.drawId = drawId;
    this.prize = prize;
  }

  /**
   * Cộng 1 entry vào delta.
   *
   * KHÔNG giữ watermark ở đây: worker lấy `batchMaxId` từ entry cuối của batch (entries đã
   * sort `_id: 1`) — accumulator không cần biết khái niệm watermark.
   */
  addEntry(entry: EntryForStats): void {
    this.revenue += entry.amount;
    this.entries += 1;
    this.commission += entry.commission;

    if (entry.amount >= this.prize.largeBetAmount) {
      this.largeBetCount += 1;
    }

    // byTenant
    const tenant = this.byTenant.get(entry.tenantId) ?? { amount: 0, entries: 0, commission: 0 };
    tenant.amount += entry.amount;
    tenant.entries += 1;
    tenant.commission += entry.commission;
    this.byTenant.set(entry.tenantId, tenant);

    // Δ tích luỹ theo account → bingo18_draw_account_stats (nguồn topAccounts chính xác).
    const acc = this.accounts.get(entry.accountId) ?? {
      username: "",
      amount: 0,
      entries: 0,
      sets: 0,
    };
    // username mới nhất thắng (snapshot username có thể đổi giữa các entry).
    if (entry.username) {
      acc.username = entry.username;
    }
    acc.amount += entry.amount;
    acc.entries += 1;
    this.accounts.set(entry.accountId, acc);

    // unitPrice snapshot từ entry; fallback config cho data cũ thiếu field.
    const unitPrice = entry.unitPrice > 0 ? entry.unitPrice : this.prize.unitPrice;

    for (const board of entry.boards) {
      this.applyBoard(board, unitPrice);
      acc.sets += board.betCount; // sets account = Σ betCount, KHÔNG số board.
    }

    // potentialWin EXACT: max over 216 outcome cho toàn bộ boards của entry — KHÔNG
    // Σ max per board (các board có thể loại trừ nhau, vd sumTotal 3 và 18).
    const potentialWin = computeBingo18EntryPotentialWin(entry.boards, this.prize.prizes);
    this.potentials.push({
      entryId: entry.id,
      accountId: entry.accountId,
      username: entry.username,
      amount: entry.amount,
      potentialWin,
    });
  }

  /** Cộng 1 board vào đúng 1 bucket delta (cùng phân nhánh playType với settle-entries.ts). */
  private applyBoard(board: EntryBoardForStats, unitPrice: number): void {
    this.sets += board.betCount;

    const bucket = this.resolveBucket(board);
    if (!bucket) return; // board shape lạ (data hỏng) — bỏ qua bucket, totals vẫn đếm.

    bucket.amount += board.betCount * unitPrice;
    bucket.sets += board.betCount;
    bucket.entries += 1; // xấp xỉ: mỗi board-hit tính 1 entry cho bucket đó (giữ ngữ nghĩa cũ — F2-b).
  }

  /**
   * Trỏ tới bucket delta đúng cho board — tạo lazy nếu chưa có trong Map/field.
   * Trả null nếu selection không hợp lệ (phòng thủ).
   */
  private resolveBucket(board: EntryBoardForStats): Bingo18BucketStat | null {
    switch (board.playType) {
      case Bingo18PlayType.SingleNum:
        return this.lazyRecordBucket(this.singleNum, board.number);
      case Bingo18PlayType.DoubleMatch:
        return this.lazyRecordBucket(this.doubleMatch, board.number);
      case Bingo18PlayType.TripleMatch:
        if (board.tripleKind === Bingo18TripleKind.Specific) {
          return this.lazyRecordBucket(this.tripleSpecific, board.number);
        }
        if (!this.tripleAny) this.tripleAny = emptyBucket();
        return this.tripleAny;
      case Bingo18PlayType.SumTotal:
        return this.lazyRecordBucket(this.sumTotal, board.sum);
      case Bingo18PlayType.BigSmallDraw:
        return this.resolveBigSmallDraw(board.bet);
      default:
        return null;
    }
  }

  /** Lazy-get-or-create bucket trong 1 record theo key số (undefined key → invalid). */
  private lazyRecordBucket(map: Map<string, Bingo18BucketStat>, key: number | undefined): Bingo18BucketStat | null {
    if (key === undefined) return null;
    const k = String(key);
    let bucket = map.get(k);
    if (!bucket) {
      bucket = emptyBucket();
      map.set(k, bucket);
    }
    return bucket;
  }

  private resolveBigSmallDraw(bet: EntryBoardForStats["bet"]): Bingo18BucketStat | null {
    switch (bet) {
      case "big":
        if (!this.big) this.big = emptyBucket();
        return this.big;
      case "draw":
        if (!this.draw) this.draw = emptyBucket();
        return this.draw;
      case "small":
        if (!this.small) this.small = emptyBucket();
        return this.small;
      default:
        return null;
    }
  }

  /**
   * Δ counters của tick để repo `$inc` vào `bingo18_draw_betting_stats`.
   *
   * `byPlayType` là PARTIAL — chỉ chứa key/bucket có delta trong tick (F2-a). Repo dùng
   * key đó build `$inc` path động (`byPlayType.singleNum.${num}` …).
   */
  drainStatsDelta(): DrawStatsDelta {
    return {
      totals: {
        revenue: this.revenue,
        entries: this.entries,
        sets: this.sets,
        commission: this.commission,
        largeBetCount: this.largeBetCount,
      },
      byPlayType: {
        singleNum: this.singleNum.size > 0 ? Object.fromEntries(this.singleNum) : undefined,
        doubleMatch: this.doubleMatch.size > 0 ? Object.fromEntries(this.doubleMatch) : undefined,
        tripleMatch:
          this.tripleSpecific.size > 0 || this.tripleAny
            ? {
                specific: this.tripleSpecific.size > 0 ? Object.fromEntries(this.tripleSpecific) : undefined,
                any: this.tripleAny,
              }
            : undefined,
        sumTotal: this.sumTotal.size > 0 ? Object.fromEntries(this.sumTotal) : undefined,
        bigSmallDraw:
          this.big || this.draw || this.small ? { big: this.big, draw: this.draw, small: this.small } : undefined,
      },
      byTenant: Object.fromEntries(this.byTenant),
      topPotential: this.potentials,
    };
  }

  /** Δ tích luỹ theo account của tick — worker ghi `bingo18_draw_account_stats`. */
  drainAccountDeltas(): AccountStatsDelta[] {
    const result: AccountStatsDelta[] = [];
    for (const [accountId, acc] of this.accounts) {
      result.push({
        drawId: this.drawId,
        accountId,
        username: acc.username,
        amount: acc.amount,
        entries: acc.entries,
        sets: acc.sets,
      });
    }
    return result;
  }
}

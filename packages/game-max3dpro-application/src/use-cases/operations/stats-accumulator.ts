/**
 * Max 3D Pro – Stats Accumulator (pure, in-memory, DELTA-ONLY)
 *
 * Gom **phần THAY ĐỔI** của 1 tick worker cho 1 kỳ, rồi xuất ra các delta để repo ghi bằng
 * `$inc`. Tách pure khỏi repo/worker để dễ test và đọc.
 *
 * ## Delta-only: khác gì bản trước?
 *
 * Bản trước giữ **full state** của kỳ trong RAM: `seed()` đọc stats doc baseline → cộng
 * entries mới → `upsertFull` overwrite toàn doc. Ba khiếm khuyết gốc (p0-01 §1):
 *
 * 1. **Buộc đọc baseline mỗi tick** — doc ~80–100KB × D kỳ × nhịp tick, kể cả khi không cược.
 * 2. **Drift không tự sửa** — doc chỉ lưu top-K nên `topPairs`/`topAccounts` seed lại bị
 *    khuyết phần rơi ngoài K; cặp/account đó lần sau tính lại từ 0 → sai số cộng dồn.
 * 3. **Nặng RAM nhất trong 4 game** — `Set<accountId>` per-pair cho tới 10⁶ ordered pairs.
 *
 * Delta-only xoá cả ba: không đọc baseline (nên không thể drift), `$inc` cộng dồn nguyên tử,
 * và `topPairs`/`topAccounts` derive lúc đọc từ `max3dpro_draw_pair_stats` /
 * `max3dpro_draw_account_stats` (chính xác tuyệt đối, không phụ thuộc K).
 *
 * ## Phân nhánh board → pair/triplet
 *
 * - Board expand pairs bằng `expandSelectionToPairs()` (domain — KHÔNG viết lại vòng lặp
 *   P(n,2)/perms). Mỗi ORDERED pair → delta `pairs["first>second"].units += betCount`
 *   — ⚠️ GIỮ THỨ TỰ, KHÔNG sort/normalize ((A,B) và (B,A) là 2 key: ĐB vs phụ ĐB).
 * - Mỗi triplet DISTINCT trong board → `tripletStakes[t].units += betCount`.
 *
 * `topPotential` VẪN gom ở đây vì `potentialWin` là metric BẤT BIẾN per-entry — entry rớt
 * khỏi top-K thì mãi mãi không cần quay lại nên top-K an toàn (repo `$push`+`$sort`+`$slice`).
 *
 * KHÔNG giữ watermark ở đây: worker lấy `batchMaxId` từ entry cuối của batch (đã sort `_id`).
 */

import { PlayMode } from "@megawin/game-max3dpro/entities";
import { expandSelectionToPairs, maxProBoardUnitWin, toOrderedPairKey } from "@megawin/game-max3dpro/rules";
import type { Max3dproPrizeSet } from "@megawin/game-max3dpro/rules";
import type {
  Max3dproByPlayType,
  Max3dproPlayTypeStat,
  Max3dproTripletStake,
  Max3dproTopPotential,
  TenantBettingStat,
} from "@megawin/game-max3dpro/entities";
import type {
  EntryForStats,
  EntryBoardForStats,
  Max3dproStatsDelta,
  Max3dproPairStatsDelta,
  Max3dproPairAccountDelta,
  Max3dproAccountStatsDelta,
} from "../../infras/repos/types";

/** Prize config + ngưỡng cược lớn gom lại — truyền 1 lần cho accumulator. */
export interface PrizeContext {
  /** Mệnh giá fallback khi entry thiếu unitPrice snapshot (data cũ). */
  unitPrice: number;
  /** Bảng giải (`defaultPrizes.standard`) — input maxProBoardUnitWin/exposure. */
  prizes: Max3dproPrizeSet;
  /** Ngưỡng cược lớn (VND) — entry.amount ≥ ngưỡng ⇒ tính vào largeBetCount. */
  largeBetAmount: number;
}

/** Δ 1 chiều pair ORDERED trong tick — tổng + breakdown account. */
interface PairDeltaState {
  first: string;
  second: string;
  units: number;
  amount: number;
  accounts: Map<string, Max3dproPairAccountDelta>;
}

/** Δ tích luỹ 1 account trong tick (chưa gắn drawId). */
interface AccountDeltaState {
  username: string;
  amount: number;
  entries: number;
  sets: number;
}

function emptyPlayTypeStat(): Max3dproPlayTypeStat {
  return { amount: 0, units: 0, boards: 0, entries: 0 };
}

function emptyByPlayType(): Max3dproByPlayType {
  return {
    multiNumber: emptyPlayTypeStat(),
    multiDigit: emptyPlayTypeStat(),
  };
}

function emptyTripletStake(): Max3dproTripletStake {
  return { units: 0, amount: 0, boards: 0 };
}

export class Max3dproDrawStatsAccumulator {
  private revenue = 0;
  private entries = 0;
  /** Σ(board.betCount) toàn kỳ → `totals.sets`. KHÁC `byPlayType.*.boards` (số board). */
  private sets = 0;
  private commission = 0;
  private largeBetCount = 0;

  private byPlayType = emptyByPlayType();
  private readonly tripletStakes = new Map<string, Max3dproTripletStake>();
  private readonly pairs = new Map<string, PairDeltaState>();
  private readonly byTenant = new Map<string, TenantBettingStat>();
  private readonly accounts = new Map<string, AccountDeltaState>();
  private readonly potentials: Max3dproTopPotential[] = [];

  constructor(
    readonly drawId: string,
    private readonly prize: PrizeContext,
  ) {}

  /** Cộng 1 entry vào delta của tick. */
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

    // Δ tích luỹ theo account → max3dpro_draw_account_stats (nguồn topAccounts chính xác).
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

    let potentialWin = 0;
    let entrySets = 0;
    for (const board of entry.boards) {
      this.applyBoard(board, unitPrice, entry.accountId);
      // PROXY thiên cao: (special + specialSub) × betCount mỗi board — multiNumber
      // chứa mọi ordered pair của tập chọn → gần như luôn có cả 2 chiều cặp ĐB (§7 Q5).
      potentialWin += maxProBoardUnitWin(this.prize.prizes) * board.betCount;
      entrySets += board.betCount;
    }

    acc.sets += entrySets;

    this.potentials.push({
      entryId: entry.id,
      accountId: entry.accountId,
      username: entry.username,
      amount: entry.amount,
      potentialWin,
    });
  }

  /** Cộng 1 board: stat theo playMode + expand ORDERED pairs + tripletStakes. */
  private applyBoard(board: EntryBoardForStats, unitPrice: number, accountId: string): void {
    const boardAmount = board.lineCount * board.betCount * unitPrice;
    this.sets += board.betCount;

    const stat = board.playMode === PlayMode.MultiDigit ? this.byPlayType.multiDigit : this.byPlayType.multiNumber;
    stat.amount += boardAmount;
    stat.units += board.lineCount * board.betCount;
    stat.boards += 1;
    stat.entries += 1; // xấp xỉ: mỗi board tính 1 entry-hit cho nhóm.

    // Expand ORDERED pairs bằng domain function — KHÔNG tự viết P(n,2)/Cartesian.
    const pairs = expandSelectionToPairs(board.playMode, {
      triplets: board.triplets,
      frontDigits: board.frontDigits,
      backDigits: board.backDigits,
    });
    // Tiền quy cho pair: mỗi pair là 1 line thực chất → per-pair = betCount × unitPrice.
    const perPairAmount = board.betCount * unitPrice;
    for (const p of pairs) {
      const key = toOrderedPairKey(p.first, p.second);
      const state = this.pairs.get(key) ?? {
        first: p.first,
        second: p.second,
        units: 0,
        amount: 0,
        accounts: new Map<string, Max3dproPairAccountDelta>(),
      };
      state.units += board.betCount;
      state.amount += perPairAmount;

      const pairAcc = state.accounts.get(accountId) ?? {
        accountId,
        units: 0,
        amount: 0,
      };
      pairAcc.units += board.betCount;
      pairAcc.amount += perPairAmount;
      state.accounts.set(accountId, pairAcc);

      this.pairs.set(key, state);
    }

    // tripletStakes: mỗi triplet DISTINCT trong board (multiDigit: perms sinh ra từ pairs).
    const distinct = new Set<string>();
    for (const p of pairs) {
      distinct.add(p.first);
      distinct.add(p.second);
    }
    for (const t of distinct) {
      const stake = this.tripletStakes.get(t) ?? emptyTripletStake();
      stake.units += board.betCount;
      stake.amount += boardAmount;
      stake.boards += 1;
      this.tripletStakes.set(t, stake);
    }
  }

  /**
   * Δ counters của tick để repo `$inc` vào `max3dpro_draw_betting_stats`.
   *
   * `byPlayType`/`tripletStakes`/`byTenant` chỉ chứa key CÓ delta trong tick — repo lọc
   * `!== 0` khi build `$inc` nên doc không nhận field rác.
   */
  drainStatsDelta(): Max3dproStatsDelta {
    return {
      totals: {
        revenue: this.revenue,
        entries: this.entries,
        sets: this.sets,
        commission: this.commission,
        largeBetCount: this.largeBetCount,
      },
      byPlayType: this.byPlayType,
      tripletStakes: Object.fromEntries(this.tripletStakes),
      byTenant: Object.fromEntries(this.byTenant),
      topPotential: this.potentials,
    };
  }

  /** Δ pair ORDERED của tick — worker ghi `max3dpro_draw_pair_stats` + `..._pair_accounts`. */
  drainPairDeltas(): Max3dproPairStatsDelta[] {
    const result: Max3dproPairStatsDelta[] = [];
    for (const [pairKey, delta] of this.pairs) {
      result.push({
        drawId: this.drawId,
        pairKey,
        first: delta.first,
        second: delta.second,
        units: delta.units,
        amount: delta.amount,
        accounts: delta.accounts,
      });
    }
    return result;
  }

  /** Δ tích luỹ theo account của tick — worker ghi `max3dpro_draw_account_stats`. */
  drainAccountDeltas(): Max3dproAccountStatsDelta[] {
    const result: Max3dproAccountStatsDelta[] = [];
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

/**
 * Max 3D – Stats Accumulator (pure, in-memory, DELTA-ONLY)
 *
 * Gom **phần THAY ĐỔI** của 1 tick worker cho 1 kỳ, rồi xuất ra delta để repo ghi bằng `$inc`.
 * Tách pure khỏi repo/worker để dễ test.
 *
 * ## Delta-only: khác gì bản trước p0-01?
 *
 * Bản trước giữ **full state** của kỳ trong RAM: `seed()` đọc stats doc baseline → cộng
 * entries mới → `$set` overwrite toàn doc. Ba khiếm khuyết gốc:
 *
 * 1. **Buộc đọc baseline mỗi tick** — `tripletStakes` sparse ≤1000 key ≈ 80KB, kể cả khi
 *    không ai cược.
 * 2. **Drift không tự sửa** — doc chỉ lưu top-K nên `topPairs`/`topAccounts` seed lại bị
 *    khuyết phần rơi ngoài K; account/pair đó lần sau tính lại từ 0.
 * 3. **Cần `recomputeClosedDraws`** để "chữa lành" số sai lúc đóng bán → 2 thuật toán song
 *    song cho cùng 1 con số, phải bảo trì và giữ khớp nhau mãi mãi.
 *
 * Delta-only xoá cả ba: không đọc baseline (nên không thể drift), `$inc` cộng dồn nguyên tử,
 * và không còn nhu cầu recompute → **1 thuật toán duy nhất**.
 *
 * `topPairs`/`topAccounts` KHÔNG còn xuất ở đây — derive lúc đọc từ
 * `max3d_draw_pair_stats`/`max3d_draw_account_stats` (p0-03) — chính xác tuyệt đối, không
 * phụ thuộc K. 2 Map `pairs`/`accounts` VẪN giữ trong RAM và xuất qua
 * `drainPairDeltas`/`drainAccountDeltas` cho worker ghi vào 2 collection phụ đó.
 *
 * `topPotential` VẪN gom ở đây vì `potentialWin` là metric **BẤT BIẾN per-entry** — entry
 * rớt khỏi top-K thì mãi mãi không cần quay lại, nên top-K an toàn (Mongo `$push` + `$sort`
 * + `$slice` lo phần cắt).
 *
 * ## Phân nhánh board → nhóm/bucket
 *
 * - basic straight: `tripletStakes[t].straightUnits += betCount`.
 * - basic combo3/combo6: expand `getUniquePermutations(t)` — MỖI HOÁN VỊ là 1 key
 *   nhận `comboXUnits += betCount` (mỗi hoán vị là 1 line dự thưởng — khớp settle).
 * - plus: pairKey UNORDERED (2 triplet sort tăng) → `pairs` map (units/amount/accounts).
 */

import { PlayMode, PlayType } from "@megawin/game-max3d/entities";
import { getUniquePermutations, maxBoardUnitWin } from "@megawin/game-max3d/rules";
import type { Max3dPrizeSet } from "@megawin/game-max3d/rules";
import type {
  Max3dPlayTypeStat,
  Max3dTripletStake,
  Max3dTopPotential,
  TenantBettingStat,
} from "@megawin/game-max3d/entities";
import type {
  DrawStatsDelta,
  EntryForStats,
  EntryBoardForStats,
  PartialByPlayTypeDelta,
  PairStatsDelta,
  AccountStatsDelta,
} from "../../infras/repos/types";

/** Prize config + ngưỡng cược lớn gom lại — truyền 1 lần cho accumulator. */
export interface PrizeContext {
  /** Mệnh giá fallback khi entry thiếu unitPrice snapshot (data cũ). */
  unitPrice: number;
  /** Bảng giải từ GlobalConfig — input maxBoardUnitWin/exposure. */
  prizes: Max3dPrizeSet;
  /** Ngưỡng cược lớn (VND) — entry.amount ≥ ngưỡng ⇒ tính vào largeBetCount. */
  largeBetAmount: number;
}

/** Delta 1 account trong tick (chưa gắn drawId) — drain thành `AccountStatsDelta`. */
interface AccountDeltaState {
  username: string;
  amount: number;
  entries: number;
}

/** Delta 1 cặp plus trong tick (chưa gắn drawId) — drain thành `PairStatsDelta`. */
interface PairDeltaState {
  triplet1: string;
  triplet2: string;
  units: number;
  amount: number;
  accountIds: Set<string>;
}

function emptyTripletStake(): Max3dTripletStake {
  return { straightUnits: 0, combo3Units: 0, combo6Units: 0, amount: 0, boards: 0 };
}

/** Khoá cặp plus UNORDERED — 2 triplet sort tăng, join "," (tiền lệ $sortArray cũ). */
export function toPairKey(t1: string, t2: string): { key: string; a: string; b: string } {
  const [a, b] = t1 <= t2 ? [t1, t2] : [t2, t1];
  return { key: `${a},${b}`, a, b };
}

export class Max3dDrawStatsAccumulator {
  private revenue = 0;
  private entries = 0;
  /** Σ(board.betCount) toàn kỳ → `totals.sets`. KHÁC `byPlayType.*.boards` (số board). */
  private sets = 0;
  private commission = 0;
  private largeBetCount = 0;

  private readonly byPlayType: PartialByPlayTypeDelta = {};
  private readonly tripletStakes = new Map<string, Max3dTripletStake>();
  private readonly pairs = new Map<string, PairDeltaState>();
  private readonly byTenant = new Map<string, TenantBettingStat>();
  private readonly accounts = new Map<string, AccountDeltaState>();
  private readonly potentials: Max3dTopPotential[] = [];

  constructor(
    readonly drawId: string,
    private readonly prize: PrizeContext,
  ) {}

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

    // account concentration
    const acc = this.accounts.get(entry.accountId) ?? { username: "", amount: 0, entries: 0 };
    if (entry.username) acc.username = entry.username;
    acc.amount += entry.amount;
    acc.entries += 1;
    this.accounts.set(entry.accountId, acc);

    // unitPrice snapshot từ entry; fallback config cho data cũ thiếu field.
    const unitPrice = entry.unitPrice > 0 ? entry.unitPrice : this.prize.unitPrice;

    let potentialWin = 0;
    for (const board of entry.boards) {
      this.applyBoard(board, unitPrice, entry.accountId);
      // PROXY thiên cao: Σ max per board (outcome space 1000²⁰ không enumerate; UI ghi
      // rõ "ước tính").
      potentialWin += maxBoardUnitWin(board.playMode, board.playType, this.prize.prizes) * board.betCount;
    }

    this.potentials.push({
      entryId: entry.id,
      accountId: entry.accountId,
      username: entry.username,
      amount: entry.amount,
      potentialWin,
    });
  }

  /** Cộng 1 board vào nhóm playType + tripletStakes/pairs. */
  private applyBoard(board: EntryBoardForStats, unitPrice: number, accountId: string): void {
    const boardAmount = board.lineCount * board.betCount * unitPrice;
    this.sets += board.betCount;

    if (board.playMode === PlayMode.Plus) {
      this.applyStat("plus", boardAmount, board.betCount);
      const [t1, t2] = board.triplets;
      if (t1 === undefined || t2 === undefined) return; // data hỏng — totals vẫn đếm.
      const { key, a, b } = toPairKey(t1, t2);
      const pair = this.pairs.get(key) ?? {
        triplet1: a,
        triplet2: b,
        units: 0,
        amount: 0,
        accountIds: new Set<string>(),
      };
      pair.units += board.betCount;
      pair.amount += boardAmount;
      pair.accountIds.add(accountId);
      this.pairs.set(key, pair);
      return;
    }

    // Basic — phân nhóm theo playType; stake per-triplet (combo expand hoán vị).
    const triplet = board.triplets[0];
    if (triplet === undefined) return;

    if (board.playType === PlayType.Straight) {
      this.applyStat("basicStraight", boardAmount, board.betCount);
      this.bumpTriplet(triplet, "straightUnits", board.betCount, boardAmount);
      return;
    }

    const isCombo3 = board.playType === PlayType.Combo3;
    this.applyStat(isCombo3 ? "basicCombo3" : "basicCombo6", boardAmount, board.betCount, board.lineCount);
    // Mỗi hoán vị là 1 line dự thưởng riêng — nhận units += betCount (khớp settle).
    for (const perm of getUniquePermutations(triplet)) {
      this.bumpTriplet(perm, isCombo3 ? "combo3Units" : "combo6Units", board.betCount, boardAmount);
    }
  }

  /** Cộng 1 board vào delta nhóm playType (partial — tạo slot nếu chưa có). units = lineCount × betCount. */
  private applyStat(key: keyof PartialByPlayTypeDelta, boardAmount: number, betCount: number, lineCount = 1): void {
    const stat: Max3dPlayTypeStat = this.byPlayType[key] ?? {
      amount: 0,
      units: 0,
      boards: 0,
      entries: 0,
    };
    stat.amount += boardAmount;
    stat.units += lineCount * betCount;
    stat.boards += 1;
    stat.entries += 1; // xấp xỉ, KHÔNG dedupe theo entry — xem JSDoc Max3dPlayTypeStat.entries.
    this.byPlayType[key] = stat;
  }

  /** Cộng units + tiền vào 1 key tripletStakes (tạo mới nếu chưa có — sparse). */
  private bumpTriplet(
    triplet: string,
    unitField: "straightUnits" | "combo3Units" | "combo6Units",
    betCount: number,
    boardAmount: number,
  ): void {
    const stake = this.tripletStakes.get(triplet) ?? emptyTripletStake();
    stake[unitField] += betCount;
    stake.amount += boardAmount;
    stake.boards += 1;
    this.tripletStakes.set(triplet, stake);
  }

  /**
   * Δ counters của tick để repo `$inc` vào `max3d_draw_betting_stats`.
   *
   * KHÔNG gồm `topPairs`/`topAccounts` — derive top-K từ collection phụ lúc đọc (dùng
   * {@link drainPairDeltas}/{@link drainAccountDeltas} để ghi 2 collection đó).
   */
  drainStatsDelta(): DrawStatsDelta {
    const tripletStakes: Record<string, Max3dTripletStake> = {};
    for (const [t, stake] of this.tripletStakes) {
      tripletStakes[t] = stake;
    }

    const byTenant: Record<string, TenantBettingStat> = {};
    for (const [tenantId, stat] of this.byTenant) {
      byTenant[tenantId] = stat;
    }

    return {
      totals: {
        revenue: this.revenue,
        entries: this.entries,
        sets: this.sets,
        commission: this.commission,
        largeBetCount: this.largeBetCount,
      },
      byPlayType: this.byPlayType,
      tripletStakes,
      byTenant,
      topPotential: this.potentials,
    };
  }

  /**
   * Δ theo cặp plus của tick để repo ghi `max3d_draw_pair_stats` + `max3d_draw_pair_accounts`.
   *
   * Chỉ gồm cặp THỰC SỰ có delta trong tick (Map `pairs` chỉ tạo entry khi gặp board plus).
   */
  drainPairDeltas(): PairStatsDelta[] {
    const out: PairStatsDelta[] = [];
    for (const [pairKey, state] of this.pairs) {
      out.push({
        drawId: this.drawId,
        pairKey,
        triplet1: state.triplet1,
        triplet2: state.triplet2,
        units: state.units,
        amount: state.amount,
        accountIds: state.accountIds,
      });
    }
    return out;
  }

  /**
   * Δ theo account của tick để repo ghi `max3d_draw_account_stats` — nguồn `topAccounts`.
   *
   * Chỉ gồm account THỰC SỰ có entry trong tick (Map `accounts` chỉ tạo entry trong `addEntry`).
   */
  drainAccountDeltas(): AccountStatsDelta[] {
    const out: AccountStatsDelta[] = [];
    for (const [accountId, state] of this.accounts) {
      out.push({
        drawId: this.drawId,
        accountId,
        username: state.username,
        amount: state.amount,
        entries: state.entries,
      });
    }
    return out;
  }
}

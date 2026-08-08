/**
 * Keno – Stats Accumulator (pure, in-memory, DELTA-ONLY)
 *
 * Gom **phần THAY ĐỔI** của 1 tick worker cho 1 kỳ, rồi xuất ra các delta để repo ghi bằng
 * `$inc`. Tách pure khỏi repo/worker để dễ test và đọc.
 *
 * ## Delta-only: khác gì bản trước p2-01?
 *
 * Bản trước giữ **full state** của kỳ trong RAM: `seed()` đọc stats doc baseline → cộng
 * entries mới → `$set` overwrite toàn doc. Ba khiếm khuyết gốc (p2-01 §3.5):
 *
 * 1. **Buộc đọc baseline mỗi tick** — 33KB × D kỳ × 6 lần/phút, kể cả khi không ai cược (R7).
 * 2. **Drift không tự sửa** — doc chỉ lưu top-K nên `topCombos`/`topAccounts` seed lại bị
 *    khuyết phần rơi ngoài K; account/combo đó lần sau tính lại từ 0 (R5).
 * 3. **Cần `recomputeClosedDraws`** để "chữa lành" số sai lúc đóng bán → 2 thuật toán song
 *    song cho cùng 1 con số, phải bảo trì và giữ khớp nhau mãi mãi.
 *
 * Delta-only xoá cả ba: không đọc baseline (nên không thể drift), `$inc` cộng dồn nguyên tử,
 * và không còn nhu cầu recompute → **1 thuật toán duy nhất**.
 *
 * `topCombos`/`topAccounts` KHÔNG còn tính ở đây — derive lúc đọc từ
 * `keno_draw_combo_stats` / `keno_draw_account_stats` (chính xác tuyệt đối, không phụ thuộc K).
 *
 * `topPotential` VẪN gom ở đây vì `potentialWin` là metric **BẤT BIẾN per-entry** — entry
 * rớt khỏi top-K thì mãi mãi không cần quay lại, nên top-K an toàn (Mongo `$push` + `$sort`
 * + `$slice` lo phần cắt).
 */

import type {
  BasicPrizes,
  BigSmallPrizes,
  EvenOddPrizes,
  KenoByPlayType,
  KenoNumberStat,
  KenoPlayTypeStat,
  KenoTopPotential,
  TenantBettingStat,
} from "@megawin/game-keno/entities";
import { KENO_VALID_NUMBERS, KenoBigSmallBet, KenoEvenOddBet, KenoPlayType } from "@megawin/game-keno/entities";
import { buildComboKey, createEmptyByPlayType, maxBoardPrize } from "@megawin/game-keno/rules";

import type {
  AccountStatsDelta,
  ComboAccountDelta,
  ComboStatsDelta,
  DrawStatsDelta,
  EntryBoardForStats,
  EntryForStats,
} from "../../infras/repos/types";

/** Prize config gom lại để truyền cho tính worst-case. */
export interface PrizeContext {
  unitPrice: number;
  basic: BasicPrizes;
  bigSmall: BigSmallPrizes;
  evenOdd: EvenOddPrizes;
  /** Ngưỡng cược lớn (VND) — entry.amount ≥ ngưỡng ⇒ tính vào largeBetCount. */
  largeBetAmount: number;
}

/** Delta 1 combo trong tick — tổng + breakdown account (chưa gắn playType/numbers). */
interface ComboDeltaState {
  playType: KenoPlayType;
  numbers: string[];
  sets: number;
  amount: number;
  accounts: Map<string, ComboAccountDelta>;
}

/** Delta 1 account trong tick (chưa gắn drawId). */
interface AccountDeltaState {
  username: string;
  amount: number;
  entries: number;
  sets: number;
}

export class DrawStatsAccumulator {
  private revenue = 0;
  private entries = 0;
  private sets = 0;
  private commission = 0;
  private largeBetCount = 0;

  /**
   * Δ theo play type. Dùng shape ĐỦ 15 slot (`createEmptyByPlayType` — factory dùng chung
   * với mapper normalize phía đọc, `rules/stats-shape.ts`) rồi repo lọc key có delta khi
   * build `$inc` (`incBy` bỏ delta 0) — đơn giản hơn giữ partial ở đây.
   */
  private readonly byPlayType: KenoByPlayType = createEmptyByPlayType();
  private readonly byTenant = new Map<string, TenantBettingStat>();
  private readonly numberFreq = new Map<string, KenoNumberStat>();
  private readonly combos = new Map<string, ComboDeltaState>();
  private readonly accounts = new Map<string, AccountDeltaState>();
  private readonly potentials: KenoTopPotential[] = [];

  private readonly worstCaseByPlayType = new Map<string, number>();
  private worstCaseTotal = 0;
  private readonly capSets = { pick8: 0, pick9: 0, pick10: 0 };

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

    // Δ tích luỹ theo account → keno_draw_account_stats (nguồn topAccounts chính xác).
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

    // Tổng potentialWin của entry (worst-case) → topPotential.
    let entryPotential = 0;
    let entrySets = 0;

    for (const board of entry.boards) {
      this.applyBoard(entry, board);
      entryPotential += this.boardWorstCase(board);
      entrySets += board.betCount;
    }

    acc.sets += entrySets;

    this.potentials.push({
      entryId: entry.id,
      accountId: entry.accountId,
      username: entry.username,
      amount: entry.amount,
      potentialWin: entryPotential,
    });
  }

  private applyBoard(entry: EntryForStats, board: EntryBoardForStats): void {
    const boardAmount = board.betCount * this.prize.unitPrice;
    this.sets += board.betCount;

    // ── byPlayType (tách hướng side bet) ──
    const stat = this.resolvePlayTypeStat(board);
    if (stat) {
      stat.amount += boardAmount;
      stat.sets += board.betCount;
    }

    // ── worst-case exposure theo playType (RAW, chưa cap — analysis §3.4) ──
    const wc = this.boardWorstCase(board);
    this.worstCaseByPlayType.set(board.playType, (this.worstCaseByPlayType.get(board.playType) ?? 0) + wc);
    this.worstCaseTotal += wc;

    // ── numberFreq + combo (chỉ basic có numbers) ──
    if (board.numbers && board.numbers.length > 0) {
      for (const num of board.numbers) {
        if (!KENO_VALID_NUMBERS.has(num)) {
          continue;
        }
        const nf = this.numberFreq.get(num) ?? { sets: 0, amount: 0 };
        nf.sets += board.betCount;
        nf.amount += boardAmount;
        this.numberFreq.set(num, nf);
      }

      // Combo: track MỌI play type (không chỉ cappable) — doc chỉ sinh cho combo thực sự
      // có người cược nên số doc bị chặn bởi số entry, không bởi không gian tổ hợp.
      // Nhờ đó `topCombos` derive lúc đọc là chính xác tuyệt đối (p2-01 §3.5.1).
      this.recordComboDelta(entry, board, boardAmount);

      // cap sets: bộ trọn bậc 8/9/10 (trúng hết) — số bộ = betCount.
      const len = board.numbers.length;
      if (len === 8) {
        this.capSets.pick8 += board.betCount;
      } else if (len === 9) {
        this.capSets.pick9 += board.betCount;
      } else if (len === 10) {
        this.capSets.pick10 += board.betCount;
      }
    }
  }

  /** Worst-case 1 board = maxPrize per unit × betCount (VND). */
  private boardWorstCase(board: EntryBoardForStats): number {
    // `board.playType` là `string` (projection thô từ `keno_ticket_entries`) — cast sang
    // `KenoPlayType` hợp lệ vì Zod đã validate giá trị này lúc place-bet (không phải đọc lại
    // input chưa qua validate, xem code-quality §5.4).
    const perUnit = maxBoardPrize(board.playType as KenoPlayType, board.bet, board.numbers?.length ?? 0, {
      basic: this.prize.basic,
      bigSmall: this.prize.bigSmall,
      evenOdd: this.prize.evenOdd,
    });
    return perUnit * board.betCount;
  }

  /** Gom delta 1 combo trong tick (accountId → Δsets/Δamount + tên). */
  private recordComboDelta(entry: EntryForStats, board: EntryBoardForStats, boardAmount: number): void {
    const numbers = [...(board.numbers ?? [])].sort();
    const key = buildComboKey(board.playType, numbers);

    const delta = this.combos.get(key) ?? {
      // Cùng lý do cast ở `boardWorstCase` — `playType` thô đã được Zod validate lúc place-bet.
      playType: board.playType as KenoPlayType,
      numbers,
      sets: 0,
      amount: 0,
      accounts: new Map<string, ComboAccountDelta>(),
    };
    delta.sets += board.betCount;
    delta.amount += boardAmount;

    const acc = delta.accounts.get(entry.accountId) ?? {
      accountId: entry.accountId,
      username: entry.username,
      sets: 0,
      amount: 0,
    };
    // username mới nhất thắng (snapshot username có thể đổi giữa các entry).
    acc.username = entry.username || acc.username;
    acc.sets += board.betCount;
    acc.amount += boardAmount;
    delta.accounts.set(entry.accountId, acc);

    this.combos.set(key, delta);
  }

  /** Trỏ tới slot KenoPlayTypeStat đúng cho board (tách hướng side bet). */
  private resolvePlayTypeStat(board: EntryBoardForStats): KenoPlayTypeStat | null {
    const pt = board.playType;
    if (pt === KenoPlayType.BigSmall) {
      switch (board.bet) {
        case KenoBigSmallBet.Big:
          return this.byPlayType.bigSmall.big;
        case KenoBigSmallBet.Small:
          return this.byPlayType.bigSmall.small;
        case KenoBigSmallBet.BigSmallDraw:
          return this.byPlayType.bigSmall.draw;
        default:
          return null;
      }
    }
    if (pt === KenoPlayType.EvenOdd) {
      switch (board.bet) {
        case KenoEvenOddBet.Even:
          return this.byPlayType.evenOdd.even;
        case KenoEvenOddBet.Even1112:
          return this.byPlayType.evenOdd.even1112;
        case KenoEvenOddBet.EvenOddDraw:
          return this.byPlayType.evenOdd.draw;
        case KenoEvenOddBet.Odd1112:
          return this.byPlayType.evenOdd.odd1112;
        case KenoEvenOddBet.Odd:
          return this.byPlayType.evenOdd.odd;
        default:
          return null;
      }
    }
    // basic pick1..pick10 — switch tường minh (thay `as unknown as Record`) để compiler bắt
    // thiếu/lệch slot khi `KenoByPlayType` đổi shape (code-quality §5.4 Q2).
    switch (pt) {
      case KenoPlayType.Pick1:
        return this.byPlayType.pick1;
      case KenoPlayType.Pick2:
        return this.byPlayType.pick2;
      case KenoPlayType.Pick3:
        return this.byPlayType.pick3;
      case KenoPlayType.Pick4:
        return this.byPlayType.pick4;
      case KenoPlayType.Pick5:
        return this.byPlayType.pick5;
      case KenoPlayType.Pick6:
        return this.byPlayType.pick6;
      case KenoPlayType.Pick7:
        return this.byPlayType.pick7;
      case KenoPlayType.Pick8:
        return this.byPlayType.pick8;
      case KenoPlayType.Pick9:
        return this.byPlayType.pick9;
      case KenoPlayType.Pick10:
        return this.byPlayType.pick10;
      default:
        return null;
    }
  }

  /**
   * Δ counters của tick để repo `$inc` vào `keno_draw_betting_stats`.
   *
   * `byPlayType` trả full 15 slot (nhiều slot = 0); repo lọc `!== 0` khi build `$inc` nên
   * doc không nhận field rác — giữ logic lọc ở 1 chỗ duy nhất.
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
      byPlayType: this.byPlayType,
      numberFreq: Object.fromEntries(this.numberFreq),
      byTenant: Object.fromEntries(this.byTenant),
      worstCaseByPlayType: Object.fromEntries(this.worstCaseByPlayType),
      worstCaseTotal: this.worstCaseTotal,
      capSets: { ...this.capSets },
      topPotential: this.potentials,
    };
  }

  /** Δ combo của tick — worker ghi `keno_draw_combo_stats` + `keno_draw_combo_accounts`. */
  drainComboDeltas(): ComboStatsDelta[] {
    const result: ComboStatsDelta[] = [];
    for (const [comboKey, delta] of this.combos) {
      result.push({
        comboKey,
        drawId: this.drawId,
        playType: delta.playType,
        numbers: delta.numbers,
        sets: delta.sets,
        amount: delta.amount,
        accounts: delta.accounts,
      });
    }
    return result;
  }

  /** Δ tích luỹ theo account của tick — worker ghi `keno_draw_account_stats`. */
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

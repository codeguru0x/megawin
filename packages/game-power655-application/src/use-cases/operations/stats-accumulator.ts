/**
 * Power 6/55 – Stats Accumulator (pure, in-memory, DELTA-ONLY)
 *
 * Gom **phần THAY ĐỔI** của 1 tick worker cho 1 kỳ, rồi xuất ra các delta để repo ghi bằng
 * `$inc`. Tách pure khỏi repo/worker để dễ test và đọc — port nguyên kiến trúc Keno
 * (`DrawStatsAccumulator`, xem JSDoc gốc cho lý giải đầy đủ "vì sao delta-only thay full
 * state"). KHÔNG đọc baseline DB (bất biến analysis §3.1(3)) — mọi giá trị RAW, biến đổi
 * (normalize/cap) diễn ra ở tầng đọc (mapper/evaluator), không phải ở đây.
 *
 * ## Khác Keno — điểm mấu chốt
 *
 * - `byPlayType` chỉ 1 tầng lá, 12 key cố định (`PlayType`) — không có slot lồng
 *   bigSmall/evenOdd như Keno (Power 6/55 không có side bet).
 * - `exposure` chỉ 1 số vô hướng `fixedWorstCase` = `Σ(entry.betUnitCount × tier1)` —
 *   tính ở CẤP ENTRY (không phải cấp board): mọi line trúng tối đa nhận tier1 (giải 5/6,
 *   không bonus), tier2/tier3 luôn < tier1 nên không cần tách theo playType (analysis §3.6).
 *   Phần JACKPOT KHÔNG có ở đây — bị chặn bởi pool (không nhân theo vé), đọc snapshot lúc
 *   build response/eval alert.
 * - `numberFreq` KHÔNG nhúng trong doc — xuất riêng qua `drainNumberDeltas()` (collection
 *   `power655_draw_number_stats`, quyết định user 05/08 — xem JSDoc entity).
 * - Combo key theo BOARD người chơi chọn (`playType:sortedMainNumbers`), KHÔNG expand
 *   lines — vé Bao 18 (18 số) là 1 combo doc, KHÔNG C(18,6) = 18.564 combo.
 */

import type { Power655PlayTypeStat, Power655TopPotential, TenantBettingStat } from "@megawin/game-power655/entities";
import { PlayType } from "@megawin/game-power655/entities";
import { buildComboKey } from "@megawin/game-power655/rules";

import type {
  AccountStatsDelta,
  ComboAccountDelta,
  ComboStatsDelta,
  DrawStatsDelta,
  EntryBoardForStats,
  EntryForStats,
  NumberStatsDelta,
  PartialPlayTypeDelta,
} from "../../infras/repos/types";

/** Prize + play config gom lại để tính worst-case + phân loại cược lớn. */
export interface PrizeContext {
  /** Giá 1 lần tham gia dự thưởng (VND) — dùng tính `boardAmount = expandedLines × betCount × unitPrice`. */
  unitPrice: number;
  /** Giải Nhất (trùng 5/6, VND/lần tham gia) — mẫu tính worst-case giải cố định. */
  tier1: number;
  /** Ngưỡng cược lớn (VND) — `entry.amount >= ngưỡng` ⇒ tính vào `totals.largeBetCount`. */
  largeBetAmount: number;
}

/** Delta 1 combo trong tick — tổng + breakdown account (chưa gắn playType/numbers). */
interface ComboDeltaState {
  playType: PlayType;
  mainNumbers: string[];
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

/** Delta 1 số trong tick (chưa gắn drawId). */
interface NumberDeltaState {
  sets: number;
  amount: number;
  boards: number;
}

/** Stat rỗng 1 slot play type — nền cho `byPlayType` trước khi cộng delta. */
function createEmptyPlayTypeStat(): Power655PlayTypeStat {
  return { amount: 0, sets: 0, boards: 0 };
}

export class Power655StatsAccumulator {
  private revenue = 0;
  private entries = 0;
  private sets = 0;
  private commission = 0;
  private largeBetCount = 0;
  private fixedWorstCase = 0;

  /**
   * Δ theo play type — full 12 slot (khởi tạo zero-stat từ `PlayType`), repo lọc key có
   * delta khi build `$inc` (chỉ ghi key `!== undefined` sau khi accumulator lọc ở
   * {@link drainStatsDelta}) — đơn giản hơn giữ partial ngay tại đây.
   */
  private readonly byPlayType: Record<PlayType, Power655PlayTypeStat> = Object.fromEntries(
    Object.values(PlayType).map((pt) => [pt, createEmptyPlayTypeStat()]),
  ) as Record<PlayType, Power655PlayTypeStat>;

  private readonly byTenant = new Map<string, TenantBettingStat>();
  private readonly numberFreq = new Map<string, NumberDeltaState>();
  private readonly combos = new Map<string, ComboDeltaState>();
  private readonly accounts = new Map<string, AccountDeltaState>();
  private readonly potentials: Power655TopPotential[] = [];

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
    this.sets += entry.betUnitCount;
    this.commission += entry.commission;

    if (entry.amount >= this.prize.largeBetAmount) {
      this.largeBetCount += 1;
    }

    // Worst-case giải cố định TÍNH Ở CẤP ENTRY (không phải cấp board): mọi line trúng tối
    // đa nhận tier1 (5/6, không bonus) — tier2/tier3 luôn < tier1 nên không tách theo
    // playType (analysis §3.6). Đây là trần tuyệt đối công ty phải trả từ doanh thu giải
    // cố định, CHƯA gồm jackpot (jackpot bị chặn bởi pool, không nhân theo vé).
    const fixedPotential = entry.betUnitCount * this.prize.tier1;
    this.fixedWorstCase += fixedPotential;

    // byTenant
    const tenant = this.byTenant.get(entry.tenantId) ?? { amount: 0, entries: 0, commission: 0 };
    tenant.amount += entry.amount;
    tenant.entries += 1;
    tenant.commission += entry.commission;
    this.byTenant.set(entry.tenantId, tenant);

    // Δ tích luỹ theo account → power655_draw_account_stats (nguồn topAccounts chính xác).
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
    acc.sets += entry.betUnitCount;
    this.accounts.set(entry.accountId, acc);

    for (const board of entry.boards) {
      this.applyBoard(entry, board);
    }

    // `topPotential` gom theo entry (metric BẤT BIẾN per-entry — an toàn top-K, xem JSDoc
    // `Power655TopPotential.fixedPotential`). KHÔNG cộng jackpot share (phụ thuộc số winner
    // cuối kỳ, không bất biến).
    this.potentials.push({
      entryId: entry.id,
      accountId: entry.accountId,
      username: entry.username,
      amount: entry.amount,
      fixedPotential,
    });
  }

  private applyBoard(entry: EntryForStats, board: EntryBoardForStats): void {
    const boardSets = board.expandedLines * board.betCount;
    const boardAmount = boardSets * this.prize.unitPrice;

    // ── byPlayType ──
    const stat = this.byPlayType[board.playType as PlayType];
    if (stat) {
      stat.amount += boardAmount;
      stat.sets += boardSets;
      // KHÔNG nhân betCount: đo "số board", không phải "số đơn vị cược" — Bao 18 amount
      // lớn nhưng boards nhỏ là tín hiệu "1 vé to" khác với "nhiều vé nhỏ" (xem JSDoc
      // `Power655PlayTypeStat.boards`).
      stat.boards += 1;
    }

    // ── numberFreq (đếm theo mainNumbers, KHÔNG expand lines) ──
    // 1 board Bao 18 (18 số đã chọn) chạm đúng 18 doc số, KHÔNG phải 18.564 (số lines sau
    // expand C(18,6)) — số xuất hiện trong board nào thì cộng TRỌN board đó, không chia.
    for (const num of board.mainNumbers) {
      const nf = this.numberFreq.get(num) ?? { sets: 0, amount: 0, boards: 0 };
      nf.sets += boardSets;
      nf.amount += boardAmount;
      nf.boards += 1;
      this.numberFreq.set(num, nf);
    }

    // ── combo (key theo BOARD, KHÔNG expand lines) ──
    this.recordComboDelta(entry, board, boardSets, boardAmount);
  }

  /** Gom delta 1 combo trong tick (accountId → Δsets/Δamount + tên). */
  private recordComboDelta(
    entry: EntryForStats,
    board: EntryBoardForStats,
    boardSets: number,
    boardAmount: number,
  ): void {
    // buildComboKey tự sort trên BẢN COPY — KHÔNG mutate `board.mainNumbers` (input đến từ
    // accumulator caller, có thể được dùng lại/so sánh ở nơi khác).
    const mainNumbers = [...board.mainNumbers].sort();
    const key = buildComboKey(board.playType, mainNumbers);

    const delta = this.combos.get(key) ?? {
      playType: board.playType as PlayType,
      mainNumbers,
      sets: 0,
      amount: 0,
      accounts: new Map<string, ComboAccountDelta>(),
    };
    delta.sets += boardSets;
    delta.amount += boardAmount;

    const acc = delta.accounts.get(entry.accountId) ?? {
      accountId: entry.accountId,
      username: entry.username,
      sets: 0,
      amount: 0,
    };
    // username mới nhất thắng (snapshot username có thể đổi giữa các entry).
    acc.username = entry.username || acc.username;
    acc.sets += boardSets;
    acc.amount += boardAmount;
    delta.accounts.set(entry.accountId, acc);

    this.combos.set(key, delta);
  }

  /**
   * Δ counters của tick để repo `$inc` vào `power655_draw_betting_stats`.
   *
   * `byPlayType` chỉ trả key THỰC SỰ có delta (`sets/amount/boards !== 0`) — repo
   * `applyDelta` lọc `!== 0` lần nữa cho từng field nhưng lọc key rỗng ở đây giúp payload
   * nhỏ hơn khi 1 tick chỉ chạm vài play type trong số 12.
   */
  drainStatsDelta(): DrawStatsDelta {
    const byPlayType: PartialPlayTypeDelta = {};
    for (const pt of Object.values(PlayType)) {
      const stat = this.byPlayType[pt];
      if (stat.amount !== 0 || stat.sets !== 0 || stat.boards !== 0) {
        byPlayType[pt] = stat;
      }
    }

    return {
      totals: {
        revenue: this.revenue,
        entries: this.entries,
        sets: this.sets,
        commission: this.commission,
        largeBetCount: this.largeBetCount,
      },
      byPlayType,
      byTenant: Object.fromEntries(this.byTenant),
      fixedWorstCase: this.fixedWorstCase,
      topPotential: this.potentials,
    };
  }

  /** Δ tần suất số của tick — worker ghi `power655_draw_number_stats`. */
  drainNumberDeltas(): NumberStatsDelta[] {
    const result: NumberStatsDelta[] = [];
    for (const [number, delta] of this.numberFreq) {
      result.push({
        drawId: this.drawId,
        number,
        sets: delta.sets,
        amount: delta.amount,
        boards: delta.boards,
      });
    }
    return result;
  }

  /** Δ tích luỹ theo account của tick — worker ghi `power655_draw_account_stats`. */
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

  /** Δ combo của tick — worker ghi `power655_draw_combo_stats` + `power655_draw_combo_accounts`. */
  drainComboDeltas(): ComboStatsDelta[] {
    const result: ComboStatsDelta[] = [];
    for (const [comboKey, delta] of this.combos) {
      result.push({
        comboKey,
        drawId: this.drawId,
        playType: delta.playType,
        mainNumbers: delta.mainNumbers,
        sets: delta.sets,
        amount: delta.amount,
        accounts: delta.accounts,
      });
    }
    return result;
  }
}

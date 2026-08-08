/**
 * Lotto 5/35 – Draw Betting Stats (pre-aggregated realtime stats)
 *
 * Collection: lotto535_draw_betting_stats — 1 document / draw.
 *
 * Thay toàn bộ ops aggregation on-demand (aggregateOpsSummary / TenantBreakdown /
 * NumberFrequency / PlayTypeDistribution / TopCombos) bằng findOne O(1). Worker
 * mini-batch cập nhật async theo watermark insert-stream — KHÔNG đụng hot path
 * place-bet.
 *
 * Port từ Power 6/55 (`packages/game-power655/src/entities/betting-stats.ts`) —
 * KHÁC Power 6/55 ở: `byPlayType` **13 key** (mainCover4/6..15 tách riêng theo N,
 * specialCover gộp 1 key — user chốt 05/08, xem {@link Lotto535StatsPlayKey}),
 * exposure single jackpot pool (không JP1/JP2 như Power 6/55).
 *
 * Xem `.cursor/analysis/lotto535-operations-risk-control.analysis.md` §3.4, §3.6.
 */

import type {
  DeltaAccumulatedDoc,
  DrawBettingStatsBase,
  DrawBettingTotals,
  OpsStatsConfig,
  TenantBettingStat,
  TopAccountStat,
} from "@megawin/game-core/types";

import type { EntryBoardSnapshot } from "./entry";
import { PlayType } from "./enums";

export type {
  DeltaAccumulatedDoc,
  DrawBettingStatsBase,
  DrawBettingTotals,
  OpsStatsConfig,
  TenantBettingStat,
  TopAccountStat,
};

/**
 * Key thống kê `byPlayType` — dẫn xuất từ (playType, mainNumbers.length). 13 giá
 * trị cố định.
 *
 * **BẮT BUỘC** (review user 06/08 — Q6): mọi giá trị PHẢI tham chiếu `PlayType`
 * member + template literal, KHÔNG plain text tự gõ ("mainCover6"...). Đổi giá
 * trị `PlayType` 1 chỗ là toàn bộ key đổi theo; compiler bắt mọi chỗ gõ nhầm
 * ("maincover6", "mainCover16"...) vì literal type dẫn xuất từ `as const`.
 *
 * `mainCover` trải N=6 (60k/board) → N=15 (30,03tr/board) — gộp 1 key thì mất
 * tín hiệu rủi ro và không đánh giá được alert `cover_high_stake` từ `byPlayType`.
 * `specialCover` gộp 1 key vì board tối đa 120k — không có rủi ro cần tách.
 */
export const Lotto535StatsPlayKey = {
  Standard: PlayType.Standard,
  MainCover4: PlayType.MainCover4,
  MainCover6: `${PlayType.MainCover}6`,
  MainCover7: `${PlayType.MainCover}7`,
  MainCover8: `${PlayType.MainCover}8`,
  MainCover9: `${PlayType.MainCover}9`,
  MainCover10: `${PlayType.MainCover}10`,
  MainCover11: `${PlayType.MainCover}11`,
  MainCover12: `${PlayType.MainCover}12`,
  MainCover13: `${PlayType.MainCover}13`,
  MainCover14: `${PlayType.MainCover}14`,
  MainCover15: `${PlayType.MainCover}15`,
  SpecialCover: PlayType.SpecialCover,
} as const;
export type Lotto535StatsPlayKey = (typeof Lotto535StatsPlayKey)[keyof typeof Lotto535StatsPlayKey];

/**
 * Map 1 board → key thống kê `byPlayType` (dùng ở accumulator, §4.3 analysis).
 *
 * `mainCover` → `mainCover${mainNumbers.length}` — N=6–15 đã được `validateSelection`
 * đảm bảo lúc place-bet, hàm này KHÔNG validate lại (rule §8 code-quality: không
 * duplicate validation Zod/business rule đã chặn ở tầng trên). 3 playType còn lại
 * (`standard`, `mainCover4`, `specialCover`) giữ nguyên giá trị `PlayType`.
 */
export function toStatsPlayKey(board: Pick<EntryBoardSnapshot, "playType" | "mainNumbers">): Lotto535StatsPlayKey {
  if (board.playType === PlayType.MainCover) {
    return `${PlayType.MainCover}${board.mainNumbers.length}` as Lotto535StatsPlayKey;
  }
  return board.playType as Lotto535StatsPlayKey;
}

/** Thống kê tiền/bộ cược của 1 key trong `byPlayType`. */
export interface Lotto535PlayTypeStat {
  /** Tổng tiền cược vào kiểu chơi này (VND). Công thức: Σ(board.expandedLines × betCount × unitPrice). */
  amount: number;
  /** Tổng số bộ cược `Σ(board.expandedLines × betCount)` — khớp `DrawBettingTotals.sets`. */
  sets: number;
  /** Số board (KHÔNG nhân betCount) — `mainCover15` amount lớn nhưng boards nhỏ, phân biệt "1 vé to" vs "nhiều vé nhỏ". */
  boards: number;
}

/**
 * Exposure — chỉ lưu phần FIXED (cộng dồn `$inc`, an toàn). Phần JACKPOT KHÔNG
 * lưu ở đây — đọc snapshot pool (jackpot cycle hiện hành) lúc build response/eval
 * alert, vì jackpot bị chặn bởi pool (không nhân số vé như giải cố định). Split
 * Cycle cũng KHÔNG cộng vào đây (phân phối post-hoc từ pool đã tích luỹ — không
 * tạo liability mới trước giờ quay). Xem analysis §3.6.
 */
export interface Lotto535Exposure {
  /**
   * Worst-case giải CỐ ĐỊNH (VND) = `totals.sets × tier1` (RAW, KHÔNG cap).
   *
   * Mỗi bộ cược trúng tối đa nhận giải tier1 (5 chính, không ĐB) — tier2–tier5/
   * consolation luôn < tier1 nên không cần tách riêng. Ngưỡng alert so bằng VND
   * tuyệt đối (`ops.alerts.fixedExposureWarnAmount`).
   */
  fixedWorstCase: number;
}

/** Vé nguy hiểm nhất theo fixed-potential — metric bất biến per-entry (an toàn top-K). */
export interface Lotto535TopPotential {
  /** ID entry (hex string). */
  entryId: string;
  /** ID account sở hữu — link tới hồ sơ tài khoản khi cần. */
  accountId: string;
  /**
   * Username hiển thị (snapshot lúc cược) — cùng tên field với `TicketEntryDoc.username`
   * để nhất quán toàn hệ thống. Ưu tiên hiển thị trước `accountId`.
   * Rỗng `""` khi entry không có username snapshot — UI fallback về `accountId`.
   */
  username: string;
  /** Tổng tiền cược của entry (VND). */
  amount: number;
  /**
   * Worst-case giải cố định của entry (VND) = `entry.betUnitCount × tier1` (config
   * snapshot lúc accumulate).
   *
   * KHÔNG cộng jackpot share lẫn split share — cả hai phụ thuộc số winner/tổng
   * betUnits toàn kỳ cuối kỳ (không bất biến per-entry), cộng vào đây sẽ vi phạm
   * nguyên tắc top-K an toàn (analysis §3.1(3), §3.6).
   *
   * **2 caveat** (review user 06/08):
   * 1. Đổi `tier1` giữa cửa sổ bán → entries trước/sau lần đổi config so sánh trên
   *    baseline khác nhau trong cùng danh sách. Chấp nhận — tín hiệu giám sát,
   *    không phải sổ cái; UI hiển thị kèm `amount` để staff đối chiếu.
   * 2. Entry vào mảng rồi bị void/resettle KHÔNG bị gỡ (delta-only, không có cơ
   *    chế remove) — drill-down PHẢI đọc trạng thái entry thật lúc xem, không tin
   *    tuyệt đối vào mảng này.
   */
  fixedPotential: number;
}

/**
 * Thống kê realtime 1 kỳ Lotto 5/35 — 1 document / draw, worker cập nhật async.
 *
 * Extends `DrawBettingStatsBase` (trừ `lastEntryId` — siết type) — thêm field đặc
 * thù: `byPlayType` (13 key cố định), `exposure` (fixed nhúng, jackpot đọc lúc
 * build response), `topPotential`.
 *
 * KHÔNG có `numberFreq` (tách {@link Lotto535DrawNumberStatsDoc} — có thêm chiều
 * `kind`), KHÔNG `topAccounts`/`topCombos` (derive lúc đọc từ
 * `lotto535_draw_account_stats`/`lotto535_draw_combo_stats`, tránh drift).
 *
 * ## Watermark & idempotent
 *
 * `totals`/`byPlayType`/`byTenant`/`exposure` cộng bằng `$inc` theo path cùng
 * `$set lastEntryId` trong 1 lệnh → nguyên tử, idempotent (xem {@link DeltaAccumulatedDoc}).
 *
 * ## `final` đóng dấu ở TERMINAL, KHÔNG ở SalesClosed
 *
 * Chỉ `Settled`/`Void` mới bảo đảm không còn entry mới. `SalesClosed` là trạng thái
 * tạm (có thể mở bán lại) — đóng dấu ở đây thì cược sau khi mở lại không bao giờ
 * được cộng.
 */
export interface Lotto535DrawBettingStatsDoc extends Omit<DrawBettingStatsBase, "lastEntryId">, DeltaAccumulatedDoc {
  /** MongoDB ObjectId. */
  _id: unknown;

  /** Phân bố kiểu chơi (thay aggregatePlayTypeDistribution) — 13 key cố định theo `Lotto535StatsPlayKey`. */
  byPlayType: Record<Lotto535StatsPlayKey, Lotto535PlayTypeStat>;

  /** Exposure: fixed nhúng ở đây, jackpot đọc lúc build response (analysis §3.6). */
  exposure: Lotto535Exposure;

  /**
   * Top entry nguy hiểm nhất theo `fixedPotential`, sort desc.
   * Cắt theo `ops.stats.topPotentialK`. An toàn với top-K vì `fixedPotential` bất biến.
   */
  topPotential: Lotto535TopPotential[];
}

/** Application-layer entity sau khi qua mapper. ObjectId → id string. */
export interface Lotto535DrawBettingStatsEntity extends Omit<Lotto535DrawBettingStatsDoc, "_id"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
}

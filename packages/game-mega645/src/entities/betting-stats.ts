/**
 * Mega 6/45 – Draw Betting Stats (pre-aggregated realtime stats)
 *
 * Collection: mega645_draw_betting_stats — 1 document / draw.
 *
 * Thay toàn bộ ops aggregation on-demand (aggregate-ops-summary / playtype-distribution
 * / number-frequency / top-combos / tenant-breakdown cũ) bằng findOne O(1). Worker
 * mini-batch cập nhật async theo watermark insert-stream — KHÔNG đụng hot path
 * place-bet.
 *
 * Port từ Power 6/55 (`packages/game-power655/src/entities/betting-stats.ts`) — KHÁC
 * Power 6/55 ở: field số chọn tên `numbers` (khớp `EntryBoardSnapshot.numbers`, Mega
 * 6/45 không có field `mainNumbers`), Jackpot ĐƠN (không JP1/JP2) → exposure jackpot
 * đọc từ 1 pool duy nhất (`DrawJackpotSnapshot`/`cycle.currentAmount`) lúc build response,
 * KHÔNG lưu ở đây.
 *
 * Xem `.cursor/analysis/mega645-operations-risk-control.analysis.md` §3.4, §3.6.
 */

import type {
  DrawBettingStatsBase,
  DrawBettingTotals,
  DeltaAccumulatedDoc,
  TenantBettingStat,
  TopAccountStat,
  OpsStatsConfig,
} from "@megawin/game-core/types";
import type { PlayType } from "./enums";
export type {
  DrawBettingStatsBase,
  DrawBettingTotals,
  DeltaAccumulatedDoc,
  TenantBettingStat,
  TopAccountStat,
  OpsStatsConfig,
};

/** Thống kê tiền/bộ cược của 1 kiểu chơi (standard hoặc 1 loại Bao). */
export interface Mega645PlayTypeStat {
  /** Tổng tiền cược vào kiểu chơi này (VND). Công thức: Σ(board.expandedLines × betCount × unitPrice). */
  amount: number;
  /** Tổng số bộ cược `Σ(board.expandedLines × betCount)` của kiểu chơi này — khớp `DrawBettingTotals.sets`. */
  sets: number;
  /** Số board (KHÔNG nhân betCount) — Bao 18 amount lớn nhưng boards nhỏ, phân biệt "1 vé to" vs "nhiều vé nhỏ". */
  boards: number;
}

/**
 * Exposure — Mega 6/45 có 1 Jackpot ĐƠN (khác Power 6/55 có JP1+JP2), càng đơn giản.
 *
 * Chỉ lưu phần FIXED (cộng dồn `$inc`, an toàn). Phần JACKPOT KHÔNG lưu ở đây —
 * đọc snapshot pool hiện hành (`DrawJackpotSnapshot.closingAmount`/`cycle.currentAmount`)
 * lúc build response/eval alert, vì jackpot bị chặn bởi pool (không nhân số vé như
 * giải cố định). Xem analysis §3.6.
 */
export interface Mega645Exposure {
  /**
   * Worst-case giải CỐ ĐỊNH (VND) = `totals.sets × tier1` (RAW, KHÔNG cap).
   *
   * Mỗi line trúng tối đa nhận giải tier1 (5/6, không bonus) — tier2/tier3 luôn
   * < tier1 nên không cần tách riêng. Đây là trần tuyệt đối phần công ty phải trả
   * từ doanh thu giải cố định. Ngưỡng alert so bằng VND tuyệt đối
   * (`ops.alerts.fixedExposureWarnAmount`, default 500tr = ¼ Power 6/55 vì tier1
   * Mega 6/45 10tr = ¼ tier1 Power 6/55 40tr).
   */
  fixedWorstCase: number;
}

/** Vé nguy hiểm nhất theo fixed-potential — metric bất biến per-entry (an toàn top-K). */
export interface Mega645TopPotential {
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
   * Worst-case giải cố định của entry (VND) = `betUnitCount × tier1` (config snapshot
   * lúc accumulate).
   *
   * KHÔNG cộng jackpot share — jackpot share phụ thuộc số winner cuối kỳ (không
   * bất biến per-entry), cộng vào đây sẽ vi phạm nguyên tắc top-K an toàn (analysis
   * §3.1(3), §3.6).
   */
  fixedPotential: number;
}

/**
 * Thống kê realtime 1 kỳ Mega 6/45 — 1 document / draw, worker cập nhật async.
 *
 * Extends `DrawBettingStatsBase` (trừ `lastEntryId` — siết type) — thêm field đặc thù:
 * `byPlayType` (12 kiểu chơi cố định), `exposure` (fixed nhúng, jackpot đọc lúc build
 * response), `topPotential`.
 *
 * ## KHÔNG có `numberFreq`, `topAccounts`, `topCombos` trong doc
 *
 * - `numberFreq` tách riêng {@link Mega645DrawNumberStatsDoc} — chừa đường thêm chỉ
 *   số unbounded per số trong tương lai mà không refactor stats doc (analysis §3.3).
 * - `topAccounts`/`topCombos` là top-K theo metric TÍCH LUỸ — derive lúc đọc từ
 *   `mega645_draw_account_stats`/`mega645_draw_combo_stats` (`sort().limit(K)`),
 *   KHÔNG lưu mảng trong doc (tránh drift — bài học Keno p2-01).
 *
 * `topPotential` VẪN nằm trong doc vì `fixedPotential` là metric BẤT BIẾN per-entry —
 * an toàn top-K.
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
export interface Mega645DrawBettingStatsDoc
  extends Omit<DrawBettingStatsBase, "lastEntryId">, DeltaAccumulatedDoc {
  /** MongoDB ObjectId. */
  _id: unknown;

  /** Phân bố kiểu chơi (thay aggregatePlayTypeDistribution) — 12 key cố định theo `PlayType`. */
  byPlayType: Record<PlayType, Mega645PlayTypeStat>;

  /** Exposure: fixed nhúng ở đây, jackpot đọc lúc build response (analysis §3.6). */
  exposure: Mega645Exposure;

  /**
   * Top entry nguy hiểm nhất theo `fixedPotential`, sort desc.
   * Cắt theo `ops.stats.topPotentialK`. An toàn với top-K vì `fixedPotential` bất biến.
   */
  topPotential: Mega645TopPotential[];
}

/** Application-layer entity sau khi qua mapper. ObjectId → id string. */
export interface Mega645DrawBettingStatsEntity extends Omit<Mega645DrawBettingStatsDoc, "_id"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
}

/**
 * `getDrawSettleReport` — types dispatcher gộp 7 game (p1-03 §2.7).
 *
 * KHÔNG gắn nhãn `ConfigItem` — báo cáo settle là dữ liệu tài chính SỰ KIỆN, field đã tự giải
 * thích qua tên (`totalStake`, `ggr`, `netProfit`…) và JSDoc ở entity gốc (`SettleDrawReport`),
 * cùng nguyên tắc RAW với `draws/` và `operations/`.
 */

import type { GameProduct } from "@megawin/game-core/entities";

/** `meta` của `getDrawSettleReport` — model biết đang xem range nào, có breakdown tenant không. */
export interface ReportDispatchMeta {
  game: GameProduct;
  /** Từ `GAME_LABELS`, KHÔNG tự map lại. */
  gameLabel: string;
  from: string;
  to: string;
  /** Có mặt khi caller hỏi breakdown 1 kỳ cụ thể theo tenant. */
  drawId?: string;
  /** Thời điểm tool đọc (ISO). */
  fetchedAt: string;
}

export interface GetDrawSettleReportDispatchInput {
  game: GameProduct;
  /** Ngày tài chính bắt đầu (YYYY-MM-DD). Bắt buộc dù có `drawId` — dùng làm audit trail phạm vi hỏi. */
  from: string;
  /** Ngày tài chính kết thúc (YYYY-MM-DD). */
  to: string;
  /** Có → breakdown theo tenant của ĐÚNG kỳ này. Không có → danh sách kỳ đã settle trong range. */
  drawId?: string;
  page?: number;
  limit?: number;
}

export interface GetDrawSettleReportDispatchOutput {
  meta: ReportDispatchMeta;
  /**
   * Không có `drawId`: RAW `ListSettleDrawReportsOutput` (danh sách kỳ đã settle theo range, có
   * `total`/`page`/`limit` để model biết có bị cắt).
   * Có `drawId`: RAW `ListDrawTenantsOutput` (breakdown theo tenant của đúng kỳ đó).
   */
  result: unknown;
}

// ─── Void Report (Wave 2) ───────────────────────────────────────────────────────

/**
 * Input `getVoidReport` — TÁI DÙNG `ReportDispatchMeta` cho output vì cùng shape
 * (game/gameLabel/from/to/drawId/fetchedAt) với `getDrawSettleReport`, không định nghĩa lại.
 */
export interface GetVoidReportDispatchInput {
  game: GameProduct;
  /** Ngày tài chính bắt đầu (YYYY-MM-DD). Bắt buộc dù có `drawId` — dùng làm audit trail phạm vi hỏi. */
  from: string;
  /** Ngày tài chính kết thúc (YYYY-MM-DD). */
  to: string;
  /** Có → breakdown theo tenant của ĐÚNG kỳ void này. Không có → danh sách kỳ đã void trong range. */
  drawId?: string;
}

export interface GetVoidReportDispatchOutput {
  meta: ReportDispatchMeta;
  /**
   * Không có `drawId`: RAW `ListVoidReportsOutput` (danh sách kỳ đã void trong range — thường RẤT
   * ÍT, void hiếm xảy ra).
   * Có `drawId`: RAW `ListVoidDrawTenantsOutput` (breakdown theo tenant của đúng kỳ void đó).
   */
  result: unknown;
}

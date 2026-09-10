/**
 * Bulk draw action — DTO kết quả, DÙNG CHUNG mọi game.
 *
 * CHỈ chứa phần OUTPUT: shape kết quả giống nhau 100% giữa các game nên FE dùng đúng 1 hook
 * (`useBulkAction`) cho cả 4 action × N game.
 *
 * Phần INPUT nằm ở từng game (`use-cases/draws/dto/bulk-draw-action.dto.ts`) VÌ tên biến môi
 * trường SFN khác nhau theo game (`KENO_VOID_SFN_ARN`, `SETTLE_SFN_ARN`…) và không phải game
 * nào cũng có đủ 4 action (Bingo18 Hub không có bulk-void — xem `p1-04` §6.4).
 */

/** Kết quả 1 kỳ trong lô bulk — luôn có mặt trong `results`, không phụ thuộc `ok`. */
export interface BulkDrawActionResult {
  drawId: string;
  /** `true` = đã chuyển trạng thái (và start worker nếu là settle), hoặc idempotent-success. */
  ok: boolean;
  /**
   * Mã lỗi khi `ok = false` — CHÍNH mã của use-case đơn (`DRAW_ALREADY_SETTLED`,
   * `DRAW_INVALID_TRANSITION`, `SFN_START_FAILED`…), cộng thêm `DRAW_SALES_WINDOW_CLOSED`
   * riêng cho bulk-open-sales và `UNKNOWN` cho lỗi không kiểm soát. `undefined` khi `ok = true`.
   */
  errorCode?: string;
  /** Thông báo tiếng Việt cho staff — hiện nguyên văn tại dòng kỳ đó, không dịch lại ở FE. */
  errorMessage?: string;
}

/**
 * Kết quả bulk — mỗi kỳ độc lập, KHÔNG all-or-nothing (partial success là hợp đồng).
 *
 * Response tầng route LUÔN `200` kể cả khi `failureCount > 0` — FE đọc `results` để tô
 * từng dòng, không rẽ nhánh theo HTTP status.
 */
export interface BulkDrawActionOutput {
  /** Kết quả từng kỳ, THỨ TỰ khớp `drawIds` đầu vào (sau khi dedupe). */
  results: BulkDrawActionResult[];
  /** Số kỳ thành công (`ok = true`). */
  successCount: number;
  /** Số kỳ thất bại (`ok = false`). */
  failureCount: number;
}

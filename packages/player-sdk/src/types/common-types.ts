/**
 * Common Types — Trạng thái vé (ticket) và đơn cược (entry) dùng chung cho tất cả game.
 *
 * Keno, Bingo 18, Max 3D, Max 3D Pro, Mega 6/45, Lotto 5/35, Power 6/55 đều dùng chung 3 khái
 * niệm trạng thái dưới đây với cùng ý nghĩa — SDK định nghĩa 1 lần duy nhất ở đây, type của từng
 * game tham chiếu lại thay vì tự khai báo union string lặp lại.
 */

/**
 * Trạng thái vé (ticket) — dùng chung cho tất cả game.
 *
 * Vòng đời thông thường: `"paid"` → `"completed"`. Nhánh phụ: `"paid"` → `"refunded"` khi TẤT
 * CẢ kỳ quay trong vé đều bị huỷ. `"void"` là trạng thái riêng biệt, không nằm trong vòng đời tự
 * động — chỉ xảy ra khi có can thiệp thủ công trên toàn bộ vé.
 */
export const TicketStatus = {
  /**
   * Đã thanh toán. Vé bị khoá (immutable), các kỳ quay tham gia đã được tạo. Đây là trạng thái
   * ngay sau khi đặt cược thành công, giữ nguyên cho tới khi tất cả kỳ quay trong vé được xử lý
   * xong.
   */
  Paid: "paid",
  /**
   * Đã hoàn tiền toàn bộ. Chỉ xảy ra khi TẤT CẢ kỳ quay trong vé đều bị huỷ — không kỳ nào được
   * settle (áp dụng cho cả vé 1 kỳ và vé nhiều kỳ); 100% tiền cược của vé được hoàn lại.
   *
   * Nếu vé nhiều kỳ chỉ MỘT PHẦN kỳ bị huỷ (phần còn lại vẫn settle bình thường), vé KHÔNG
   * chuyển sang `"refunded"` — vẫn giữ `"paid"` (đang xử lý) hoặc `"completed"` (đã xử lý xong).
   * Phần bị huỷ đó chỉ được ghi nhận riêng ở field tóm tắt hoàn tiền của response (nếu có).
   */
  Refunded: "refunded",
  /**
   * Vô hiệu hoá toàn bộ vé — dành cho gian lận, lỗi nghiêm trọng, hoặc can thiệp chủ động trên
   * toàn bộ vé. Khác với `"refunded"`: đây không phải kết quả tự nhiên của việc một hoặc nhiều
   * kỳ quay bị huỷ, mà là hành động riêng áp dụng cho cả vé.
   */
  Void: "void",
  /**
   * Đã xử lý xong tất cả kỳ quay trong vé (mỗi kỳ đã settle hoặc bị huỷ), với ít nhất 1 kỳ được
   * settle. Vé `"completed"` vẫn có thể có một phần kỳ bị huỷ — xem field tóm tắt hoàn tiền của
   * response (nếu có) để biết chi tiết phần đó.
   */
  Completed: "completed",
} as const;

/**
 * Type của {@link TicketStatus} — `"paid" | "refunded" | "void" | "completed"`.
 */
export type TicketStatus = (typeof TicketStatus)[keyof typeof TicketStatus];

/**
 * Trạng thái entry (đơn cược tham gia 1 kỳ quay) — dùng chung cho tất cả game.
 *
 * Vòng đời: `"scheduled"` → `"settled"` (kỳ quay diễn ra bình thường), hoặc `"scheduled"` →
 * `"void"` (kỳ quay bị huỷ).
 */
export const EntryStatus = {
  /** Đã lên lịch tham gia kỳ quay. Tiền cược đã trừ, đang chờ đến giờ quay và settle. */
  Scheduled: "scheduled",
  /** Đã tính thưởng xong (terminal). Xem `outcome`/`payout` của entry để biết kết quả. */
  Settled: "settled",
  /**
   * Kỳ quay bị huỷ (lỗi hệ thống, sự cố vận hành, …). Entry bị vô hiệu, tiền cược của riêng kỳ
   * này được hoàn lại. Không liên quan đến {@link TicketStatus.Void} — đó là vô hiệu hoá toàn bộ
   * vé, còn đây chỉ là 1 kỳ (trong vé có thể nhiều kỳ) bị huỷ.
   */
  Void: "void",
} as const;

/**
 * Type của {@link EntryStatus} — `"scheduled" | "settled" | "void"`.
 */
export type EntryStatus = (typeof EntryStatus)[keyof typeof EntryStatus];

/**
 * Kết quả cuối cùng của entry sau khi settle hoặc bị huỷ — dùng chung cho tất cả game.
 *
 * `undefined` trên field `outcome` nghĩa là entry chưa settle (còn ở trạng thái
 * {@link EntryStatus.Scheduled}).
 */
export const EntryOutcome = {
  /** Thắng — có ít nhất 1 giải trúng (tiền thưởng > 0). */
  Win: "win",
  /** Thua — không trúng giải nào. */
  Loss: "loss",
  /**
   * Kỳ quay bị huỷ, entry vô hiệu, tiền cược được hoàn lại. Tương ứng entry có
   * `status: EntryStatus.Void`.
   */
  Void: "void",
} as const;

/**
 * Type của {@link EntryOutcome} — `"win" | "loss" | "void"`.
 */
export type EntryOutcome = (typeof EntryOutcome)[keyof typeof EntryOutcome];

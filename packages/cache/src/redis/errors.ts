/**
 * Lỗi "đã biết Redis đang lỗi → bỏ qua ngay" của Redis layer.
 *
 * Tách ra file riêng (không nằm trong `client.ts`) vì `stores/redis-store.ts`
 * cần bắt đúng class này (để bỏ qua không log — xem `RedisCacheStore.logFailOpen`)
 * mà không import thẳng client factory chỉ để lấy 1 class error.
 *
 * `DeadlineExceededError` **không** chuyển vào đây: nó gắn chặt với cơ chế
 * `withDeadline` (chỉ 1 nơi sinh), giữ cùng file với hàm sinh ra nó dễ đọc hơn.
 */

/**
 * Redis đang bị cắt chủ động (circuit connect đang mở) — lệnh bị bỏ qua ở
 * **0 RTT**, không thử connect.
 *
 * Class riêng (không `Error` trần) vì đây là **trạng thái degrade ĐÃ BIẾT**, không
 * phải sự cố mới:
 * - `RedisCacheStore.logFailOpen` **bỏ qua hoàn toàn**, không log. Sự kiện đáng log
 *   là lúc circuit MỞ (đã log đúng 1 lần ở nơi mở nó); log lại ở mỗi lời gọi chỉ
 *   tạo log storm — Redis down 1 tiếng với 200 rps × 3 key = hàng nghìn dòng/giây,
 *   dìm chết đúng những dòng cần người xử lý.
 * - Caller fail-fast (`RedisRepository`) vẫn nhận throw như trước, không đổi hành vi.
 *
 * ⚠️ Với caller ghi dữ liệu (lock/idempotency/rate-limit): lỗi này **đảm bảo lệnh
 * CHƯA chạy** (chưa gửi byte nào) — khác hẳn `DeadlineExceededError` (không biết
 * đã chạy hay chưa). Xem JSDoc `RedisRepository`.
 */
export class RedisCircuitOpenError extends Error {
  /** Mốc epoch ms mà circuit tự đóng lại (cho phép probe). */
  public readonly openUntilMs: number;

  constructor(label: string, openUntilMs: number) {
    super(`Redis circuit open for ${label}`);
    this.name = "RedisCircuitOpenError";
    this.openUntilMs = openUntilMs;
  }
}

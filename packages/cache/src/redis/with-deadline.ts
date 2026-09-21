/**
 * Bọc promise bằng trần thời gian tổng. Quá hạn → reject {@link DeadlineExceededError}.
 *
 * `Promise.race` chỉ bỏ KẾT QUẢ, không huỷ việc đang chạy bên dưới — caller phải
 * tự quyết xử lý resource khi bắt {@link DeadlineExceededError}:
 * - `client.ts` (pha connect): `destroy()` — bắt buộc, vì một connect về muộn sẽ
 *   để lại socket mở mà không ai giữ reference.
 * - `redis-store.ts` (pha command): **không** huỷ connection, chỉ bỏ qua lệnh.
 *   Huỷ ở đây sẽ biến 1 latency spike thành mất cache trọn cửa sổ circuit dù
 *   Redis vẫn khoẻ (đã đo) — xem `runCommand` cho phân tích đánh đổi.
 *
 * Dùng ở ĐÚNG 2 chỗ, mỗi chỗ phủ 1 gap của node-redis **đã đo được** —
 * không có cơ chế sẵn nào của thư viện thay thế được:
 *
 * | Pha | Gap của node-redis |
 * |---|---|
 * | connect | `connectTimeout` bị gỡ ngay khi event `'connect'` bắn, TRƯỚC khi RESP handshake (HELLO/AUTH) chạy. Server accept TCP rồi im lặng (Redis OOM nhưng kernel vẫn accept qua backlog) → handshake chờ vô hạn. Đo: `connectTimeout=1000` × 2 lần thử vẫn treo ở 4000ms không settle |
 * | command | `commandOptions.timeout` bị **tháo listener** ngay khi command rời `#toWrite` sang `#waitingForReply` (`@redis/client` `commands-queue.js` quanh dòng 423–430) → chỉ bảo vệ pha CHƯA gửi. Command đã ghi socket mà không có reply (network stall, AWS SG/NAT drop im lặng, failover blackhole) treo **vĩnh viễn**. Đo: `timeout: 300` vẫn treo >10s; không truyền gì treo >50s dù `DEFAULT_COMMAND_TIMEOUT = 5000` |
 *
 * Timer **phải** `clearTimeout` trong `finally` — timer rò giữ event loop
 * Lambda sống thêm, tốn tiền và làm test treo.
 */

/**
 * Lỗi `withDeadline` ném khi `task` không settle kịp `deadlineMs`.
 *
 * Class riêng (không `Error` trần) để caller phân biệt được **deadline** với lỗi
 * Redis thường, vì 2 loại cần xử lý khác nhau: deadline = có thể trần đang đặt
 * quá thấp so với thực tế → `logError` kèm hướng dẫn tăng cấu hình; lỗi thường
 * (`WRONGTYPE`, `ClientClosedError`…) = degrade bình thường, chỉ `logWarn`.
 */
export class DeadlineExceededError extends Error {
  /** Trần đã vi phạm (ms) — log để đối chiếu với hằng cấu hình. */
  public readonly deadlineMs: number;

  constructor(label: string, deadlineMs: number) {
    super(`${label}: vượt deadline ${deadlineMs}ms`);
    this.name = "DeadlineExceededError";
    this.deadlineMs = deadlineMs;
  }
}

/**
 * Chạy `task` với trần `deadlineMs`. Quá hạn → reject {@link DeadlineExceededError}.
 *
 * @param task - Promise cần giới hạn thời gian.
 * @param deadlineMs - Trần ms (phải > 0).
 * @param label - Gắn vào message lỗi để `logError` đọc được (không dùng `AppException` —
 *   `@megawin/cache` là hạ tầng, không biết HTTP).
 */
export async function withDeadline<T>(task: Promise<T>, deadlineMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new DeadlineExceededError(label, deadlineMs));
      }, deadlineMs);
    });
    return await Promise.race([task, timeout]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

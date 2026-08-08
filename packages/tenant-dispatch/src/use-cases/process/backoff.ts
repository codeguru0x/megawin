import { BACKOFF_BASE_SECONDS, BACKOFF_MAX_SECONDS } from "../../config";

/**
 * Tính `nextAttemptAt` cho 1 attempt thất bại.
 *
 * Công thức: `min(BACKOFF_BASE_SECONDS * 2^retry, BACKOFF_MAX_SECONDS)` — exponential
 * tới khi chạm trần 30 phút, sau đó retry đều mỗi 30 phút.
 *
 * **Không dùng jitter**: với setup hiện tại (`reservedConcurrency: 1`, retry lane
 * `limit: 100/tick`, không có horizontal scaling) thundering herd không thể xảy ra —
 * throughput đã bị Lambda single instance throttle cứng. Jitter chỉ làm
 * `nextAttemptAt` phi deterministic, gây khó debug khi so sánh 2 order cùng batch
 * mà delay chênh nhau vài giây. Nếu sau này scale lên nhiều worker song song, cân
 * nhắc thêm lại full jitter `rand(0, cappedDelay)`.
 *
 * @param retryCount - Số lần đã retry TRƯỚC attempt này (0 cho attempt đầu fail).
 * @returns Timestamp attempt tiếp theo.
 */
export function computeNextAttemptAt(retryCount: number, now: Date = new Date()): Date {
  const delaySeconds = Math.min(BACKOFF_BASE_SECONDS * 2 ** retryCount, BACKOFF_MAX_SECONDS);
  return new Date(now.getTime() + delaySeconds * 1000);
}

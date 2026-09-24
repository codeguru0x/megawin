/**
 * Constants cấu hình trung tâm của @megawin/guard — 1 nguồn sự thật.
 *
 * Gom timeout / default rule / key version về đây thay vì rải trong từng file.
 */

/**
 * Trần thời gian pha **command** (EVALSHA/EVAL) trên hot path (ms).
 *
 * Hằng này phủ **pha command**, không phải cả `checkRateLimit`. Pha connect
 * (`getClient`) có trần riêng `DEFAULT_REDIS_CONNECT_DEADLINE_MS` (5000ms) —
 * tổng worst-case = 5250ms. Xem bảng trần ở JSDoc class `RateLimiter`.
 *
 * Ngắn hơn `DEFAULT_REDIS_COMMAND_TIMEOUT_MS` của `@megawin/cache` (500ms):
 * cache miss còn phải đi DB, còn rate limit chỉ cần quyết định nhanh — chậm hơn
 * trần này thì thà cho qua (fail-open) hơn là kéo latency request thật.
 *
 * **250ms** (không 100ms): headroom cho p99 Redis ngoài VPC / spike ngắn. Trần
 * quá thấp → Redis hơi chậm nhưng vẫn healthy làm GCRA fail-open **liên tục**
 * (= bypass phòng thủ). Vẫn ngắn hơn cache để outage Redis không kéo request.
 * Theo dõi `failedOpen` + p99 sau rollout — nếu Redis chậm thường xuyên, nâng
 * tiếp (không đoán trước).
 *
 * Truyền vào `withDeadline` ở `RateLimiter` — KHÔNG dùng `commandOptions.timeout`
 * của redis@6 (node-redis tháo timeout listener khi command rời queue; xem
 * `packages/cache` `with-deadline.ts` / p0-00).
 */
export const DEFAULT_RATE_LIMIT_TIMEOUT_MS = 250;

/**
 * Burst mặc định khi rule không khai `burst`.
 *
 * `0` = spacing tuyệt đối (không cho vượt steady rate). Caller muốn burst ngắn
 * (VD place-bet liên tiếp) phải khai tường minh.
 */
export const DEFAULT_RATE_LIMIT_BURST = 0;

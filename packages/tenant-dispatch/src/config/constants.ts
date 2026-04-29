/**
 * Constants cho Tenant Dispatch.
 *
 * Backoff + chunk/query limits được hard-code tại đây, không lưu per-order.
 *
 * Kể từ phiên bản retry-lane, retry là **vô hạn** cho mọi loại lỗi — không còn
 * cap `MAX_RETRY_BY_KIND`. Orders luôn stay `Pending` đến khi `markDispatched`
 * hoặc `cancelOrder`. UI `listStuck` dùng `RETRY_ALERT_THRESHOLD` để cảnh báo
 * staff các order đã retry quá nhiều lần.
 */

// ─────────────────────────────────────────────
// Backoff
// ─────────────────────────────────────────────

/** Base cho exponential backoff (giây). `nextAt = min(BASE * 2^retry, MAX)`. */
export const BACKOFF_BASE_SECONDS = 30;

/**
 * Trần backoff (giây). 30 phút: đủ rải tải khi tenant down kéo dài,
 * vẫn đủ nhanh để hồi phục khi tenant bật lại (delay tối đa nửa giờ).
 */
export const BACKOFF_MAX_SECONDS = 30 * 60;

/**
 * Số lần retry trước khi đánh "stuck" — surface lên BO UI để staff check tenant.
 * Không gây tác động tự động lên order (không đổi status, không dừng retry);
 * chỉ là ngưỡng để filter/alert. 50 ≈ tenant đã fail nhiều giờ tới 1 ngày tuỳ backoff.
 */
export const RETRY_ALERT_THRESHOLD = 50;

// ─────────────────────────────────────────────
// Worker batching
// ─────────────────────────────────────────────

/**
 * Kích thước mỗi batch gửi tenant. Khớp giới hạn của `batchTransaction` trong tenant-gateway
 * (`PAYOUT_CHUNK_SIZE` = 50 để giảm rủi ro timeout / partial failure).
 */
export const DISPATCH_CHUNK_SIZE = 50;

/**
 * Số orders main lane poll mỗi lần chạy (fresh orders — `retryCount` missing).
 * Đủ để xử lý kỳ quay lớn (~500-1000 winners) trong ~1 phút.
 */
export const DISPATCH_MAIN_QUERY_LIMIT = 500;

/**
 * Số orders retry lane poll mỗi lần chạy (orders đã fail ít nhất 1 lần —
 * `retryCount` exists). Thấp hơn main lane vì tenant gặp vấn đề có thể phản hồi chậm,
 * lane này tolerate cao hơn (timeout 5 phút) nhưng vẫn giới hạn để không overload.
 */
export const DISPATCH_RETRY_QUERY_LIMIT = 100;

// ─────────────────────────────────────────────
// Soft time-budget — worker dừng vòng lặp trước khi Lambda timeout cứng
// ─────────────────────────────────────────────

/**
 * Budget main lane (ms). Lambda timeout = 60s → dừng ở 55s để kịp flush
 * logs/bulk write cuối và không bị Lambda kill cứng giữa chừng.
 */
export const DISPATCH_MAIN_MAX_EXECUTION_MS = 55 * 1000;

/**
 * Budget retry lane (ms). Lambda timeout = 300s → dừng ở 285s (chừa 15s
 * margin). Retry lane làm việc chậm hơn nên margin lớn hơn chút cũng an toàn.
 */
export const DISPATCH_RETRY_MAX_EXECUTION_MS = 285 * 1000;

// ─────────────────────────────────────────────
// Distributed lock — worker-core integration
// ─────────────────────────────────────────────

/**
 * Lock key cho main lane. Mỗi invocation cạnh tranh cùng key này → chỉ 1 chạy
 * tại 1 thời điểm. Tách khỏi retry lane để 2 lane chạy song song.
 */
export const DISPATCH_MAIN_LOCK_KEY = "tenant-dispatch:main";

/**
 * Lock key cho retry lane. Mutually exclusive với main lane (filter
 * `retryCount $exists` khác nhau) nên không cần cùng lock.
 */
export const DISPATCH_RETRY_LOCK_KEY = "tenant-dispatch:retry";

/**
 * TTL lock main lane (giây). Bằng đúng Lambda timeout.
 *
 * ## Lý do chọn bằng Lambda timeout, KHÔNG cộng buffer
 *
 * TTL chỉ có tác dụng khi worker **crash không release**. Release bình thường
 * clear `ownerToken = null` → invocation kế tiếp acquire ngay qua filter
 * `{ ownerToken: null }`, KHÔNG phải đợi `expiresAt`.
 *
 * Khi crash: `expiresAt = acquireTime + TTL`. Vì Lambda bị kill cứng ở `timeout`,
 * runtime tối đa = `timeout`. Chọn `TTL = timeout` đảm bảo:
 * - A crash lúc T ∈ [0, timeout] → `expiresAt = T_acquire + timeout`.
 * - Schedule lần sau T=60s → `now - acquireTime ≥ timeout` → takeover được.
 *
 * Cộng thêm buffer (VD 90s) KHÔNG giải quyết vấn đề gì — chỉ khiến invocation
 * sau phải chờ lâu hơn để takeover khi worker thật sự chết.
 */
export const DISPATCH_MAIN_LOCK_TTL_SECONDS = 60;

/**
 * TTL lock retry lane (giây). Bằng đúng Lambda timeout — cùng lý do như main.
 */
export const DISPATCH_RETRY_LOCK_TTL_SECONDS = 300;

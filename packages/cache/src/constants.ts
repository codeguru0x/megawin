/**
 * Constants cấu hình trung tâm của @megawin/cache — 1 nguồn sự thật.
 *
 * Gom mọi hằng số cấu hình (env key, TTL, giới hạn, timeout) về đây thay vì
 * rải rác trong từng file implementation. Đổi tuning chỉ sửa 1 chỗ.
 */

/**
 * Tên biến môi trường mặc định chứa Redis connection URI.
 *
 * Đây chỉ là DEFAULT. `RedisRepository`/`RedisCacheStore` vẫn cho truyền
 * `redisEnvKey` khác để trỏ instance Redis riêng (VD `REDIS_RATELIMIT_URI`
 * cho rate-limit, `REDIS_LEADERBOARD_URI` cho leaderboard) — tách workload
 * nặng khỏi cache. Hằng này chỉ định env dùng khi caller KHÔNG chỉ định gì.
 */
export const DEFAULT_REDIS_ENV_KEY = "REDIS_URI" as const;

/**
 * Số entry tối đa của L1 memory cache cho toàn process.
 *
 * Đủ rộng cho config 7 games × nhiều tenant (mỗi entry là object config nhỏ,
 * tổng vài MB — không đáng kể so với RAM Lambda 128MB+ / Next.js server).
 * Khi đầy, LRU evict entry ít dùng nhất — không crash, không leak.
 */
export const DEFAULT_L1_MAX = 1000;

/**
 * TTL của L1 (seconds) khi chạy tiered (L1 + L2 Redis) — hằng số tuyệt đối.
 *
 * L1 chỉ là "đệm chống lặp trong container"; L2 mới là source of truth. Con số
 * này là STALENESS BOUND: sau khi invalidate qua L2, container khác thấy giá
 * trị mới trễ tối đa `DEFAULT_L1_TTL_SEC`. Staleness gắn với YÊU CẦU ĐỘ TƯƠI
 * (bao lâu chấp nhận đọc data hơi cũ), độc lập với `ttlSec` của từng loại cache
 * — nên là tuyệt đối, KHÔNG tính theo tỉ lệ của `ttlSec`.
 *
 * 5s: nhân viên đổi config ở backoffice thấy hiệu lực gần như tức thì (≤5s),
 * đồng thời chặn phần lớn traffic lặp không đập vào Redis. `TieredCache` lấy
 * `min(ttlSec, DEFAULT_L1_TTL_SEC)` để cache siêu ngắn (2-3s) không bị L1 giữ
 * lâu hơn ý định caller.
 */
export const DEFAULT_L1_TTL_SEC = 5;

/**
 * Trần thời gian mỗi Redis command trên HOT PATH (ms).
 *
 * Truyền vào `withDeadline` ở `RedisCacheStore` → quá hạn thì **bỏ qua lệnh đó**
 * và degrade fail-open (miss/no-op), connection giữ nguyên. Cache chậm hơn DB
 * thì vô nghĩa → trần ngắn. KHÔNG áp cho `deleteByPrefix` (admin, có thể kéo
 * dài hợp lệ).
 *
 * Quá hạn ghi `logError` kèm hướng dẫn tăng hằng này (xem `RedisCacheStore`):
 * vượt deadline có thể là latency spike (bỏ qua được) hoặc trần đặt quá thấp so
 * với p99 thật — chỉ tần suất log phân biệt được 2 ca.
 *
 * ⚠️ KHÔNG dùng `commandOptions.timeout` của redis@6 cho việc này: node-redis
 * tháo timeout listener ngay khi command rời queue ghi sang chờ reply, nên
 * command đã gửi mà không có reply treo vĩnh viễn (đo probe: `timeout: 300`
 * vẫn treo >10s khi network stall). Chi tiết ở `redis/with-deadline.ts`.
 *
 * ⚠️ Chỉ phủ pha **command** (sau khi client đã connect). Pha connect được siết
 * bởi {@link DEFAULT_REDIS_CONNECT_TIMEOUT_MS} + {@link DEFAULT_REDIS_CONNECT_MAX_RETRIES}
 * + circuit {@link REDIS_CIRCUIT_OPEN_MS} — xem `redis/client.ts`.
 */
export const DEFAULT_REDIS_COMMAND_TIMEOUT_MS = 500;

/**
 * Trần thời gian cho thao tác Redis **ADMIN** (`deleteByPrefix` — SCAN + DEL
 * batch), tính bằng ms.
 *
 * Rộng gấp nhiều lần hot path vì SCAN cả keyspace lớn có thể kéo dài HỢP LỆ.
 * Nhưng vẫn PHẢI có trần: node-redis không cắt được command đã gửi mà không có
 * reply (xem `redis/with-deadline.ts`), nên "không truyền timeout" nghĩa là
 * **treo tới khi Lambda/Vercel giết request** — kể cả khi hàm đó đã fail-open.
 */
export const DEFAULT_REDIS_ADMIN_TIMEOUT_MS = 15_000;

/**
 * Trần thời gian **một lần** TCP(+TLS) handshake khi connect Redis (ms).
 *
 * Rộng hơn {@link DEFAULT_REDIS_COMMAND_TIMEOUT_MS} vì handshake TLS cross-AZ
 * có thể ~200ms; trả giá **1 lần/process**, không phải mỗi request. Default
 * của node-redis là 5000ms — quá dài cho hot path fail-open.
 *
 * ⚠️ **3000ms** là số phỏng đoán (nới từ 1000ms ban đầu để chứa TLS Redis Cloud
 * cross-AZ), **CHƯA đo p99 trên prod**. Đặt thấp hơn p99 connect thật → mọi cold
 * start fail-open âm thầm (app không lỗi nhưng mất cache trọn
 * {@link REDIS_CIRCUIT_OPEN_MS}). `connectClient` (`redis/client.ts`) ghi
 * `logError` mỗi lần vượt trần chính là để phát hiện ca này: thấy log đó trong
 * khi Redis Cloud vẫn healthy = trần quá thấp, đo p99 rồi tăng cả hằng này và
 * {@link DEFAULT_REDIS_CONNECT_DEADLINE_MS} lên trên p99.
 */
export const DEFAULT_REDIS_CONNECT_TIMEOUT_MS = 2000;

/**
 * Số lần thử LẠI khi connect thất bại (tổng lần thử = 1 + giá trị này).
 *
 * **KHÔNG được đặt 0 / dùng `reconnectStrategy: false`.** node-redis gọi
 * `#shouldReconnect(0, err)` khi socket đứt **sau khi đã ready**
 * (`@redis/client` `socket.js` quanh dòng 313–334): `false` tại `retries = 0`
 * làm client **không bao giờ tự reconnect** sau blip mạng bình thường.
 * Dạng `(retries) => retries >= N ? false : 50` trả số ở `retries = 0` → cho
 * phép reconnect, vẫn dừng sau N lần thử lại.
 */
export const DEFAULT_REDIS_CONNECT_MAX_RETRIES = 1;

/**
 * Backstop cứng cho **toàn bộ** pha connect (ms) — bọc `connect()` bằng
 * `withDeadline`. Đây là trần tổng, **không** thay `connectTimeout` +
 * `reconnectStrategy` (cơ chế huỷ thật).
 *
 * Công thức: `CONNECT_TIMEOUT(3000) + headroom sự cố (~2000)` = **5000**.
 * Headroom gồm RESP handshake HELLO/AUTH, jitter, và biên độ khi mạng/TLS chậm
 * (cross-AZ spike, Redis Cloud failover). Đổi
 * {@link DEFAULT_REDIS_CONNECT_TIMEOUT_MS} **phải** tính lại hằng này — luôn
 * `DEADLINE > CONNECT_TIMEOUT`.
 *
 * ⚠️ KHÔNG nhân theo {@link DEFAULT_REDIS_CONNECT_MAX_RETRIES}. Bản cũ 2500
 * (= 1000 × 2 lần thử + backoff) "chứa đủ" cả retry → black-hole làm 50 request
 * đồng thời đều tốn ~2500ms vì `connecting` gộp chúng. Trả giá 2 lần handshake là
 * vô nghĩa khi {@link REDIS_CIRCUIT_OPEN_MS} đã cho thử lại sau 5s. Retry là
 * **best-effort trong budget**: fail nhanh (ECONNREFUSED ~1ms) vẫn kịp lần 2;
 * fail chậm (black-hole) bị cắt đúng hằng này.
 *
 * ⚠️ Cận dưới hợp lệ là {@link DEFAULT_REDIS_CONNECT_TIMEOUT_MS}: thấp hơn thì
 * **1** handshake hợp lệ cũng không kịp → cache tắt vĩnh viễn, fail-open âm thầm.
 *
 * ⚠️ 5000ms vẫn **chưa đo p99 trên prod**. Nếu p99 connect thật > 5000ms thì mọi
 * cold start fail-open âm thầm — `logError` ở `connectClient` là cách duy nhất
 * biết điều đó đang xảy ra.
 */
export const DEFAULT_REDIS_CONNECT_DEADLINE_MS = 5000;

/**
 * Thời gian circuit "mở" sau connect fail (ms) — trong cửa sổ này mọi lời gọi
 * `getRedisClient` throw ngay (0 RTT) thay vì trả giá connect lại.
 *
 * Không có circuit, Redis down khiến MỖI lời gọi cache cộng thêm tới
 * {@link DEFAULT_REDIS_CONNECT_DEADLINE_MS} — đường "fail-open" biến thành
 * đường chậm. Thiết yếu cho cả Vercel (nhiều request/process) và Lambda (nhiều
 * cache call trong 1 invocation).
 *
 * 5s: đủ ngắn để tự phục hồi sau blip, đủ dài để 1 invocation Lambda không trả
 * giá connect 2 lần.
 *
 * ⚠️ ĐÃ CÂN NHẮC VÀ BỎ: bậc thang lũy tiến `[5s, 15s, 60s]` theo số lần fail
 * liên tiếp. Redis Cloud phục hồi nhanh (HA + proxy failover), nên sự cố dài —
 * đúng ca mà bậc thang tối ưu — là ca hiếm; đổi lại nó đòi thêm 1 Map
 * `connectFailures` phải reset đúng ở mọi nhánh, và làm thời gian mất cache sau
 * một blip xấu nhất dài gấp 12 lần. Giữ 1 hằng phẳng.
 */
export const REDIS_CIRCUIT_OPEN_MS = 5000;

/**
 * Số key xoá mỗi batch trong `deleteByPrefix` (SCAN + DEL theo lô).
 *
 * Cân bằng giữa số round-trip tới Redis (batch lớn → ít lệnh hơn) và độ dài
 * mỗi lệnh DEL (batch quá lớn → command dài, chiếm event loop Redis lâu hơn).
 */
export const DELETE_BATCH_SIZE = 100;

/**
 * Giới hạn độ dài internal command queue của node-redis (`#toWrite` +
 * `#waitingForReply`), truyền vào `createClient({ commandsQueueMaxLength })`.
 *
 * Với `disableOfflineQueue: false` (mặc định, giữ nguyên — xem `client.ts` cho
 * lý do KHÔNG set `true`), lệnh gọi lúc client đang reconnect (`isOpen &&
 * !isReady`) được node-redis **xếp vào queue trong RAM** rồi gửi thật khi
 * reconnect xong, KHÔNG reject ngay. Không có trần, queue phình vô hạn nếu
 * traffic dồn trong lúc Redis down kéo dài (nhiều request/container trên
 * Vercel, nhiều cache call/invocation trên Lambda) → leak RAM, và mỗi lệnh kẹt
 * trong queue vẫn phải chờ hết `commandDeadlineMs` của `RedisCacheStore` mới
 * được coi là miss (không giúp fail nhanh hơn).
 *
 * Vượt ngưỡng → node-redis reject `Error("The queue is full")` ngay (0 RTT) —
 * store bọc bằng `runCommand`/`withDeadline` nên lỗi này đi thẳng vào nhánh
 * fail-open (miss/no-op) giống mọi lỗi Redis khác, KHÔNG throw ra consumer.
 *
 * 1000: đủ lớn để không chặn burst traffic bình thường (mỗi container/process
 * hiếm khi có >1000 lệnh Redis đang chờ đồng thời), đủ nhỏ để chặn leak RAM khi
 * Redis down kéo dài. Chưa đo p99 concurrent command trên prod — nếu log
 * "The queue is full" xuất hiện thường xuyên dù Redis khoẻ, tăng hằng này.
 */
export const DEFAULT_REDIS_COMMANDS_QUEUE_MAX_LENGTH = 1000;

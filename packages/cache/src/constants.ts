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
 * Timeout mỗi Redis command HOT PATH (ms) trong `RedisCacheStore`.
 *
 * Truyền vào `commandOptions.timeout` của redis@6: quá hạn → redis tự HỦY
 * command (AbortSignal, bỏ khỏi queue nếu chưa ghi socket) và reject → store
 * bắt lỗi, degrade fail-open (miss). Cache chậm hơn DB thì vô nghĩa → trần ngắn.
 * KHÔNG áp cho `deleteByPrefix` (admin, giữ default 5s của redis@6).
 */
export const DEFAULT_REDIS_COMMAND_TIMEOUT_MS = 300;

/**
 * Số key xoá mỗi batch trong `deleteByPrefix` (SCAN + DEL theo lô).
 *
 * Cân bằng giữa số round-trip tới Redis (batch lớn → ít lệnh hơn) và độ dài
 * mỗi lệnh DEL (batch quá lớn → command dài, chiếm event loop Redis lâu hơn).
 */
export const DELETE_BATCH_SIZE = 100;

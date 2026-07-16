/**
 * Core contracts của @megawin/cache — interface-first, backend-agnostic.
 *
 * Consumer chỉ phụ thuộc `CacheStore` / `createCachedFetcher`, KHÔNG biết
 * backend là memory / Redis / Memcached / tiered. Chọn backend là quyết định
 * composition tại app bootstrap (xem `stores/default-store.ts`).
 *
 * Nguyên tắc bắt buộc cho mọi implementation:
 * - FAIL-OPEN: backend lỗi → không throw ra consumer. `get` trả undefined,
 *   `set`/`delete` nuốt lỗi + log. Cache là optimization, không bao giờ là
 *   hard dependency trên hot path.
 * - TTL bắt buộc: không cho phép key sống vô hạn — staleness luôn có cận trên.
 */

/**
 * Contract chung cho mọi cache backend (memory / Redis / tiered / noop).
 *
 * Mọi method PHẢI fail-open: backend lỗi → không throw ra consumer.
 */
export interface CacheStore {
  /** Đọc value theo key. Miss hoặc backend lỗi → `undefined`. */
  get<T>(key: string): Promise<T | undefined>;

  /**
   * Ghi value với TTL. `ttlSec` bắt buộc — không cho phép key vô hạn.
   * Value phải JSON-serializable (Redis lưu JSON string).
   */
  set<T>(key: string, value: T, ttlSec: number): Promise<void>;

  /** Xoá 1 key. Key không tồn tại → no-op. */
  delete(key: string): Promise<void>;

  /**
   * Xoá mọi key bắt đầu bằng prefix.
   * Memory: scan keys nội bộ. Redis: SCAN + DEL theo batch (không dùng KEYS).
   * Dùng khi bump version hàng loạt hoặc invalidate cả namespace.
   */
  deleteByPrefix(prefix: string): Promise<void>;
}

/**
 * Sự kiện quan sát được từ 1 lần `fetch()` — dùng cho metrics/logging hit-rate.
 *
 * - `hit`          : store trả value — không chạy loader.
 * - `miss`         : store miss — loader được chạy (hoặc join single-flight).
 * - `loader-error` : loader lỗi — lỗi throw ra caller.
 */
export interface CacheFetchEvent {
  type: "hit" | "miss" | "loader-error";
  /** Cache key đầy đủ của lần fetch. */
  key: string;
}

/** Options cho `createCachedFetcher` — xem JSDoc từng field. */
export interface CachedFetcherOptions<TArg = string | void> {
  /** Backend cache — memory / Redis / tiered / noop, do bootstrap quyết định. */
  store: CacheStore;

  /**
   * Namespace + entity + version cho key (phần TĨNH) — build bằng `cacheKey()`
   * qua registry `XXX_CACHE_KEYS` của package. VD: `"identity:user:v1"`.
   * Key đầy đủ = `${keyPrefix}:${discriminator}` (discriminator ghép runtime).
   */
  keyPrefix: string;

  /** TTL cho value hợp lệ (seconds). */
  ttlSec: number;

  /**
   * TTL cho kết quả `null`/`undefined` (negative caching, seconds).
   * Mặc định = `ttlSec`. Đặt `0` để KHÔNG cache kết quả rỗng
   * (VD: tenant config chưa tạo — muốn thấy ngay khi admin tạo mới).
   */
  negativeTtlSec?: number;

  /**
   * Chuyển arg thành discriminator (phần động ở đuôi key) — BẮT BUỘC khi arg
   * KHÔNG phải `string | void` (composite arg như `{ tenantId, role }`).
   * Arg string đơn giản (userId, tenantId) KHÔNG cần keyOf.
   *
   * Quy tắc bắt buộc (vi phạm → `buildKey` throw hoặc cache phân mảnh):
   * - Nối field bằng `_`/`-`, TUYỆT ĐỐI không `:` (ký tự phân tầng key).
   * - Thứ tự field tường minh, ổn định. KHÔNG `JSON.stringify(arg)` /
   *   `Object.values().join()` — đổi thứ tự field → đổi key → cache miss oan.
   * - Kết quả không được rỗng.
   * - Field nhạy cảm (apiKey, email, token) PHẢI `hashKeyPart()` — key lộ trong log Redis.
   *
   * @example
   * keyOf: ({ tenantId, role }) => `${tenantId}_${role}`         // composite
   * keyOf: (apiKey) => hashKeyPart(apiKey)                       // secret → hash
   */
  keyOf?: (arg: TArg) => string;

  /**
   * Hook quan sát hit/miss/loader-error — cắm metrics/log hit-rate.
   * Được gọi sync và fail-safe: hook throw không ảnh hưởng flow fetch.
   */
  onEvent?: (event: CacheFetchEvent) => void;
}

/**
 * Fetcher đã wrap cache — thay thế trực tiếp cho loader gốc.
 *
 * `invalidate(arg)` xoá cache cho 1 arg cụ thể; `invalidateAll()` xoá cả
 * prefix — gọi từ update use-case sau khi ghi DB thành công.
 */
export interface CachedFetcher<TArg, TResult> {
  /**
   * Đọc qua cache: hit → trả ngay; miss → chạy loader → set cache → trả.
   * `arg` là discriminator động (userId…) — key = `keyPrefix[:{arg|keyOf(arg)}]`.
   * Concurrent fetch cùng key trong 1 process chỉ chạy loader 1 lần (single-flight).
   *
   * MỖI fetcher = 1 view (1 shape kết quả + 1 keyPrefix). Cùng 1 entity cần
   * nhiều view (VD "1 tenant" vs "list all tenant") → tạo NHIỀU fetcher, mỗi
   * cái keyPrefix riêng — KHÔNG nhồi chung 1 fetcher. Khi update, nhớ invalidate
   * tất cả view bị ảnh hưởng (sửa 1 item làm CŨ cả cache list).
   */
  fetch(arg: TArg): Promise<TResult>;

  /**
   * Xoá cache cho 1 arg cụ thể — gọi sau khi update DB record đó thành công.
   * Fire-and-forget an toàn (fail-open: backend lỗi không throw).
   */
  invalidate(arg: TArg): Promise<void>;

  /**
   * Xoá MỌI key thuộc keyPrefix của fetcher này (mọi discriminator).
   * Dùng khi cần clear cả entity — VD ops flush toàn bộ user cache.
   */
  invalidateAll(): Promise<void>;
}

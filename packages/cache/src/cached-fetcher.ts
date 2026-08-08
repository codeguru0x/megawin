/**
 * createCachedFetcher — read-through cache wrapper, pattern chuẩn cho mọi hot lookup.
 *
 * Đảm bảo 3 hành vi mà mọi consumer cần nhưng dễ viết sai:
 * - SINGLE-FLIGHT : concurrent calls cùng key trong 1 process chỉ chạy loader 1 lần.
 *                   Hiệu quả CAO ở process dài (Next.js server/worker, nhiều request
 *                   đồng thời cùng process); hiệu quả HẠN CHẾ trên Lambda 1-request-
 *                   per-container (ít khi 2 invocation đụng cùng `inflight` Map).
 * - FAIL-OPEN     : store lỗi → gọi thẳng loader, không throw vì cache.
 * - NEGATIVE CACHE: kết quả null/undefined cũng được cache (TTL riêng) —
 *                   tránh dội DB liên tục cho entity không tồn tại.
 *
 * Cache miss → load từ source; source lỗi → throw (không che giấu lỗi DB).
 * Lớp chịu lỗi khi DB down là L2 Redis (shared, sống qua cold start), KHÔNG
 * phải stale-in-RAM per-process.
 *
 * ⚠️ LOADER KHÔNG ĐƯỢC catch-và-nuốt lỗi (return fallback khi DB lỗi). Nếu
 * loader tự `catch (err) { return null }`, `loadAndCache` coi đó là "data thật
 * sự rỗng" và NEGATIVE-CACHE nó với TTL — 1 lần DB chập chờn có thể khiến cả
 * cluster "tưởng" entity không tồn tại trong `negativeTtlSec` giây kế tiếp, dù
 * DB đã hồi phục ngay sau đó. Muốn log lỗi thì catch-log-rethrow, không
 * catch-return-fallback.
 *
 * Value được bọc envelope `{ v }` trước khi set để phân biệt "cached null"
 * với "cache miss" trên mọi backend (Redis lưu JSON). Field 1 ký tự `v` là
 * quy ước thực dụng cho envelope kỹ thuật nội bộ (không bao giờ lộ ra API
 * công khai) — không phải chuẩn bắt buộc, đổi thành `value` không sai logic.
 *
 * Observability: truyền `onEvent` để đo hit/miss/loader-error per key.
 */

import type { CachedFetcher, CachedFetcherOptions, CacheFetchEvent } from "./types";

/** Envelope bọc value trong store — phân biệt cached-null vs cache-miss. */
interface CacheEnvelope<T> {
  v: T | null;
}

/**
 * Tạo read-through cached fetcher quanh 1 loader.
 *
 * DISCRIMINATOR ĐỘNG (userId, tenantId…) KHÔNG khai trong key — truyền qua
 * tham số `fetch(arg)`, fetcher tự ghép vào đuôi keyPrefix. 3 dạng arg:
 *
 * @param loader  - Hàm load dữ liệu gốc (thường là repo method). `arg` là:
 *                  - `void`   → fetcher global (VD global-config), key = keyPrefix.
 *                  - `string` → discriminator string (userId/tenantId), key = `keyPrefix:{arg}`.
 *                  - `object` → BẮT BUỘC truyền `keyOf` để derive discriminator.
 * @param options - Store, keyPrefix (TĨNH), TTL, keyOf, onEvent… — xem {@link CachedFetcherOptions}.
 *
 * @example
 * // arg void — global config, không có discriminator
 * const globalCfg = createCachedFetcher(
 *   () => repo.getGlobalConfig(),
 *   { store, keyPrefix: KENO_CACHE_KEYS.globalConfig, ttlSec: 60 },
 * );
 * await globalCfg.fetch();        // key: "keno:global-config:v1"
 * await globalCfg.invalidate();   // sau khi update config
 *
 * @example
 * // arg string — discriminator động (userId), tự ghép vào đuôi
 * const userCache = createCachedFetcher<string, UserEntity | null>(
 *   (userId) => repo.getUserById(userId),
 *   { store, keyPrefix: IDENTITY_CACHE_KEYS.user, ttlSec: 60 },
 * );
 * await userCache.fetch("u_123");      // key: "identity:user:v1:u_123"
 * await userCache.invalidate("u_123"); // xoá đúng 1 user
 *
 * @example
 * // arg object nhiều field — bắt buộc keyOf (nối "_", không dùng ":")
 * const permCache = createCachedFetcher<{ tenantId: string; role: string }, Perm | null>(
 *   ({ tenantId, role }) => repo.getPermissions(tenantId, role),
 *   {
 *     store,
 *     keyPrefix: IDENTITY_CACHE_KEYS.permission,
 *     ttlSec: 60,
 *     keyOf: ({ tenantId, role }) => `${tenantId}_${role}`, // → "...:v1:tenant_abc_admin"
 *   },
 * );
 *
 * @example
 * // NHIỀU VIEW cho CÙNG 1 entity — MỖI view 1 fetcher + 1 keyPrefix RIÊNG.
 * // KHÔNG nhồi "1 item" và "list all" vào 1 fetcher (khác shape, khác TTL, khác invalidation).
 * const oneFetcher = createCachedFetcher<string, TenantConfigEntity | null>(
 *   (tenantId) => repo.getTenantConfig(tenantId),
 *   { store, keyPrefix: BINGO18_CACHE_KEYS.tenantConfig, ttlSec: 60 },
 * );      // key: "bingo18:tenant-config:v1:{tenantId}"
 * const listFetcher = createCachedFetcher<void, TenantConfigEntity[]>(
 *   () => repo.listTenantConfigs(),
 *   { store, keyPrefix: BINGO18_CACHE_KEYS.tenantConfigList, ttlSec: 120 },
 * );      // key: "bingo18:tenant-config-list:v1"
 *
 * // ⚠️ INVALIDATION LIÊN ĐỚI: sửa 1 tenant làm STALE cả 2 view.
 * // Đóng gói fan-out TRONG cache module, export method theo Ý ĐỊNH nghiệp vụ.
 * // Use-case chỉ gọi 1 dòng — KHÔNG tự gọi lần lượt từng fetcher.invalidate().
 * export const tenantConfigCache = {
 *   fetch: (id: string) => oneFetcher.fetch(id),
 *   fetchAll: () => listFetcher.fetch(),
 *   // "tenant này vừa đổi" → tự xoá key item + bust cache list (song song).
 *   invalidateTenant: (id: string) =>
 *     Promise.all([oneFetcher.invalidate(id), listFetcher.invalidate()]),
 * };
 * // Trong update use-case: await tenantConfigCache.invalidateTenant(tenantId);
 */
export function createCachedFetcher<TArg = void, TResult = unknown>(
  loader: (arg: TArg) => Promise<TResult>,
  options: CachedFetcherOptions<TArg>,
): CachedFetcher<TArg, TResult> {
  const { store, keyPrefix, ttlSec, keyOf, onEvent } = options;
  const negativeTtlSec = options.negativeTtlSec ?? ttlSec;

  // In-flight promises per key — single-flight trong 1 process.
  const inflight = new Map<string, Promise<TResult>>();

  /**
   * Build cache key đầy đủ từ arg: `{keyPrefix}[:{discriminator}]`.
   *
   * `keyPrefix` là phần TĨNH (`identity:user:v1`) đã cố định lúc tạo fetcher.
   * Phần này chỉ lo ghép DISCRIMINATOR ĐỘNG (userId, tenantId…) vào đuôi.
   *
   * 3 dạng arg mà consumer hay gặp:
   * - `void`/`undefined` (fetcher global, VD global-config) → key = keyPrefix, không có đuôi.
   * - `string` (userId, tenantId)                          → `keyPrefix:{arg}`, không cần keyOf.
   * - `object`/nhiều field (VD `{ tenantId, role }`)        → BẮT BUỘC truyền `keyOf` để
   *   tự gộp field thành 1 string. Quên keyOf = throw (xem lý do bên dưới).
   *
   * 3 lần throw có chủ đích — fail SỚM lúc lập trình còn hơn cache trả sai âm thầm:
   * 1. arg là object mà thiếu keyOf → nếu để lọt, JS ép `String(obj)` = "[object Object]"
   *    → MỌI object khác nhau cùng ra 1 key → collision, cache trả nhầm data.
   * 2. discriminator rỗng → key trùng keyPrefix → đụng fetcher global.
   * 3. discriminator chứa ":" → phá convention phân tầng `{ns}:{entity}:{ver}:{disc}`.
   */
  const buildKey = (arg: TArg): string => {
    // Không có arg (fetcher global) → key = keyPrefix.
    if (arg === undefined) {
      return keyPrefix;
    }

    // keyOf có → dùng nó derive discriminator (dành cho object/composite arg).
    // Không có keyOf → dùng thẳng arg (kỳ vọng arg đã là string như userId/tenantId).
    const discriminator = keyOf ? keyOf(arg) : arg;
    // Arg không phải string và không có keyOf → lỗi lập trình, phải fail sớm
    // thay vì stringify ngầm ("[object Object]" gây collision key thầm lặng).
    if (typeof discriminator !== "string") {
      throw new Error(`CachedFetcher "${keyPrefix}": arg không phải string — bắt buộc truyền keyOf để derive key.`);
    }

    // Chuỗi rỗng gây key trùng keyPrefix → collision với fetcher global — fail sớm.
    if (discriminator === "") {
      throw new Error(`CachedFetcher "${keyPrefix}": discriminator rỗng — arg/keyOf không hợp lệ.`);
    }

    // ":" là ký tự phân tầng key toàn hệ thống — discriminator chứa ":" sẽ tạo tầng giả.
    // keyOf nối nhiều field phải dùng "_" hoặc "-", KHÔNG dùng ":".
    if (discriminator.includes(":")) {
      throw new Error(
        `CachedFetcher "${keyPrefix}": discriminator "${discriminator}" chứa ":" — phá vỡ key convention.`,
      );
    }

    return `${keyPrefix}:${discriminator}`;
  };

  // Hook fail-safe: metrics hook throw không được ảnh hưởng flow fetch.
  const emit = (type: CacheFetchEvent["type"], key: string): void => {
    // Nếu không có onEvent, không làm gì cả.
    if (!onEvent) {
      return;
    }

    try {
      onEvent({ type, key });
    } catch {
      // Nuốt lỗi hook — observability không bao giờ phá hot path.
    }
  };

  const loadAndCache = async (arg: TArg, key: string): Promise<TResult> => {
    let result: TResult;

    try {
      result = await loader(arg);
    } catch (err) {
      // Source (DB) lỗi → throw, KHÔNG che giấu. Lớp chịu lỗi khi DB down là
      // L2 Redis (còn TTL thì store.get đã hit ở trên, không tới đây).
      //
      // Nhánh này chỉ chạy khi promise của loader(arg) REJECT. Nếu loader tự
      // try/catch và trả fallback (VD `catch { return null }`), promise đó
      // RESOLVE — code sẽ KHÔNG vào đây, KHÔNG emit "loader-error", và result
      // = null sẽ bị hiểu là "data rỗng thật" rồi bị negative-cache ở dưới.
      // ⇒ loader không được catch-và-nuốt lỗi DB.
      emit("loader-error", key);
      throw err;
    }

    // Negative caching: null/undefined cache với TTL riêng; TTL 0 = không cache.
    const isEmptyResult = result === null || result === undefined;

    const effectiveTtl = isEmptyResult ? negativeTtlSec : ttlSec;
    if (effectiveTtl > 0) {
      // Cache nội dung result trong v của CacheEnvelope.
      const envelope: CacheEnvelope<TResult> = { v: result ?? null };

      // set() của mọi CacheStore đã fail-open — không cần try/catch thêm.
      await store.set(key, envelope, effectiveTtl);
    }

    return result;
  };

  return {
    /**
     * Đọc qua cache: hit → trả ngay; miss → chạy loader → set cache → trả.
     * `arg` là discriminator động (userId…) — key = `keyPrefix[:{arg|keyOf(arg)}]`.
     * Concurrent fetch cùng key trong 1 process chỉ chạy loader 1 lần (single-flight).
     */
    async fetch(arg: TArg): Promise<TResult> {
      const key = buildKey(arg);

      // store.get đã fail-open — backend lỗi trả undefined như cache miss.
      const cached = await store.get<CacheEnvelope<TResult>>(key);

      if (cached !== undefined) {
        emit("hit", key);
        return cached.v as TResult;
      }

      // Nếu không có cached, emit miss.
      emit("miss", key);

      // Single-flight: N request đồng thời cùng key trong process này mà
      // đều miss cache → chỉ request ĐẦU TIÊN chạy loadAndCache (set vào
      // inflight ngay trước khi promise resolve); N-1 request sau "quá
      // giang" cùng promise, không gọi loader thêm lần nào.
      //
      // Phạm vi tác dụng = 1 process. Next.js server/worker (nhiều request
      // đồng thời share 1 process) → chống thundering-herd hiệu quả rõ rệt.
      // Lambda (thường 1 request/container/lúc) → 2 invocation hiếm khi đụng
      // cùng Map này, nên tác dụng hạn chế hơn — vẫn hữu ích nếu 1 invocation
      // tự gọi fetch() nhiều lần cùng key, nhưng đừng kỳ vọng nó dedupe được
      // request từ các container Lambda khác nhau.
      const existing = inflight.get(key);

      if (existing) {
        return existing;
      }

      const promise = loadAndCache(arg, key).finally(() => {
        inflight.delete(key);
      });

      inflight.set(key, promise);

      return promise;
    },

    /**
     * Xoá cache cho 1 arg cụ thể — gọi sau khi update DB record đó thành công.
     * Fire-and-forget an toàn (fail-open: backend lỗi không throw).
     */
    async invalidate(arg: TArg): Promise<void> {
      const key = buildKey(arg);
      await store.delete(key);
    },

    /**
     * Xoá MỌI key thuộc keyPrefix của fetcher này (mọi discriminator).
     * Dùng khi cần clear cả entity — VD ops flush toàn bộ user cache.
     */
    async invalidateAll(): Promise<void> {
      await store.deleteByPrefix(keyPrefix);
    },
  };
}

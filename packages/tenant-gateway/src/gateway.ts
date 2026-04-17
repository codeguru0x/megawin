/**
 * tenantGateway — Facade duy nhất để gọi callback API của tenant.
 *
 * Self-contained: tự resolve config từ identity DB, cache per tenantId, concurrent dedup.
 * Consumer chỉ cần import `tenantGateway` và gọi `.getClient(tenantId)`.
 *
 * Cache tuned cho tenant config (URL + API key hầu như không đổi):
 * - TTL 10 phút — chấp nhận stale ngắn, giảm DB query gần như về 0.
 * - Max 500 tenants — headroom lớn, mỗi entry ~200 bytes.
 * - Stale-on-reject — DB lỗi → trả stale client thay vì throw.
 * - Concurrent dedup — cùng tenantId đồng thời chỉ trigger 1 DB query.
 *
 * @example
 * ```ts
 * import { tenantGateway } from "@megawin/tenant-gateway";
 *
 * const client = await tenantGateway.getClient("acme");
 * if (!client) {
 *   // Tenant chưa setup callbackBaseUrl → DRY-RUN mode
 *   return;
 * }
 * await client.batchTransaction({ items: [...] });
 * ```
 */

import { LRUCache } from "lru-cache";
import { createTenantGatewayClient, type TenantGatewayClient } from "./client";
import { TenantCallbackConfigRepo } from "./infras/repos/tenant-callback-config-repo";
import { logError } from "@megawin/shared/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Cache internals
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Timeout cho mỗi HTTP request tới tenant gateway (ms).
 * 30s đủ cho batchTransaction qua internet; tenant API chậm hơn thì cần tune per-tenant.
 */
const DEFAULT_TIMEOUT = 30_000;

/**
 * Thời gian cache 1 TenantGatewayClient (ms).
 *
 * 10 phút: callbackBaseUrl + apiKey gần như không bao giờ thay đổi giữa các kỳ quay.
 * Settle 1 draw (200 entries × 4 batches) hoàn tất trong ~30s → 1 DB query / 10 phút / tenant.
 *
 * Trade-off: nếu admin rotate apiKey, client cũ vẫn dùng tối đa 10 phút.
 * Workaround: gọi `tenantGateway.invalidate(tenantId)` khi update config.
 */
const CACHE_TTL_MS = 10 * 60_000;

/**
 * Số tenant tối đa giữ trong cache cùng lúc.
 *
 * 500 = headroom rất lớn cho production (hiện ~10-50 tenants active).
 * Mỗi entry ~200 bytes (1 HttpClient instance + metadata) → ~100KB total.
 * LRU evict tenant ít dùng nhất khi đầy → không lo memory leak.
 */
const CACHE_MAX_SIZE = 500;

const NO_CONFIG = Symbol("NO_CONFIG");
type CacheValue = TenantGatewayClient | typeof NO_CONFIG;

let repo: TenantCallbackConfigRepo | null = null;
let cache: LRUCache<string, CacheValue> | null = null;

function getRepo(): TenantCallbackConfigRepo {
  if (!repo) repo = new TenantCallbackConfigRepo();
  return repo;
}

function getCache(): LRUCache<string, CacheValue> {
  if (!cache) {
    cache = new LRUCache<string, CacheValue>({
      max: CACHE_MAX_SIZE,
      ttl: CACHE_TTL_MS,

      // DB lỗi → trả stale client (config hiếm khi đổi → stale vẫn đúng).
      allowStaleOnFetchRejection: true,
      allowStaleOnFetchAbort: true,

      // Không tự purge expired — evict lazy khi access hoặc khi cần slot.
      ttlAutopurge: false,

      fetchMethod: async (tenantId: string): Promise<CacheValue> => {
        const config = await getRepo().getCallbackConfig(tenantId);
        if (!config?.callbackBaseUrl) {
          return NO_CONFIG;
        }

        return createTenantGatewayClient({
          callbackBaseUrl: config.callbackBaseUrl,
          apiKey: config.apiKey ?? "",
          tenantId: config.tenantId,
          timeout: DEFAULT_TIMEOUT,
        });
      },
    });
  }
  return cache;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public facade
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Facade quản lý TenantGatewayClient — import 1 lần, dùng mọi nơi.
 *
 * @example
 * ```ts
 * import { tenantGateway } from "@megawin/tenant-gateway";
 *
 * // Trong dispatch payout/refund:
 * const client = await tenantGateway.getClient(tenantId);
 * if (!client) return handleDryRun(entries);
 *
 * await client.batchTransaction({ items });
 *
 * // Khi admin update callbackBaseUrl hoặc rotate API key:
 * tenantGateway.invalidate(tenantId);
 * ```
 */
export const tenantGateway = {
  /**
   * Lấy TenantGatewayClient cho tenant — cached, concurrent dedup.
   *
   * Trả `null` nếu tenant chưa setup callbackBaseUrl (DRY-RUN mode).
   * Kết quả null cũng được cache — không query DB lại trong TTL.
   *
   * @param tenantId - ID tenant cần lấy client.
   */
  async getClient(tenantId: string): Promise<TenantGatewayClient | null> {
    const value = await getCache().fetch(tenantId);

    if (value === NO_CONFIG || value === undefined) {
      logError("TenantGateway", new Error(`No config found for tenant ${tenantId}`), { tenantId });
      return null;
    }

    return value;
  },

  /**
   * Xoá cache cho 1 tenant — gọi khi admin update callbackBaseUrl hoặc rotate API key.
   * Request tiếp theo sẽ re-resolve từ DB.
   */
  invalidate(tenantId: string): void {
    cache?.delete(tenantId);
  },

  /** Xoá toàn bộ cache — dùng khi deploy hoặc bulk config change. */
  invalidateAll(): void {
    cache?.clear();
  },
} as const;

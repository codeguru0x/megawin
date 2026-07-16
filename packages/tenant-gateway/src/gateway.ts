/**
 * tenantGateway — Facade duy nhất để gọi callback API của tenant.
 *
 * Self-contained: tự resolve config từ identity DB, cache per tenantId, concurrent dedup.
 * Consumer chỉ cần import `tenantGateway` và gọi `.getClient(tenantId)`.
 *
 * ## Cache CONFIG, không cache CLIENT
 *
 * Cache lớp DATA (callback config) qua `@megawin/cache`, rồi build
 * `TenantGatewayClient` mỗi lần gọi. Lý do:
 * - Client chỉ là wrapper mỏng quanh `fetch` — không giữ socket/connection pool
 *   → tạo lại mỗi lần gần như free. Cái đắt là DB query, và đó mới là thứ được cache.
 * - Config JSON-serializable → dùng được cả L1 memory lẫn L2 Redis (khi có
 *   `REDIS_URI`). Nếu cache client object sẽ mất method khi serialize qua Redis.
 *
 * Hành vi cache (thừa hưởng từ `createCachedFetcher`, xem `caches/`):
 * - TTL 10 phút — chấp nhận stale ngắn, giảm DB query gần về 0.
 * - Stale-on-error — DB lỗi → trả config cũ trong process thay vì throw.
 * - Concurrent dedup — cùng tenantId đồng thời chỉ trigger 1 DB query.
 * - Negative cache — tenant chưa setup → cache `null`, không dội DB.
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

import { createTenantGatewayClient, type TenantGatewayClient } from "./client";
import { tenantCallbackConfigCache } from "./caches";
import { logWarn } from "@megawin/shared/utils";

/**
 * Timeout cho mỗi HTTP request tới tenant gateway (ms).
 * 30s đủ cho batchTransaction qua internet; tenant API chậm hơn thì cần tune per-tenant.
 */
const DEFAULT_TIMEOUT = 30_000;

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
 * await tenantGateway.invalidate(tenantId);
 * ```
 */
export const tenantGateway = {
  /**
   * Lấy TenantGatewayClient cho tenant — config cached, concurrent dedup.
   *
   * Trả `null` nếu tenant chưa setup callbackBaseUrl (DRY-RUN mode). Kết quả
   * `null` cũng được negative-cache — không query DB lại trong TTL.
   *
   * "Chưa có config" là 1 trạng thái nghiệp vụ hợp lệ (DRY-RUN), KHÔNG phải lỗi
   * kỹ thuật — mỗi caller có policy xử lý khác nhau (block request, queue retry,
   * hoặc coi là no-op). Vì vậy gateway CHỈ `logWarn` để observability, KHÔNG
   * `throw`/`logError` và KHÔNG tự quyết mức độ nghiêm trọng — quyền đó thuộc
   * về caller (VD `debit-player-service` throw `AppException.badRequest`).
   *
   * Client được build mới mỗi lần từ config đã cache (rẻ, không I/O).
   *
   * @param tenantId - ID tenant cần lấy client.
   */
  async getClient(tenantId: string): Promise<TenantGatewayClient | null> {
    const config = await tenantCallbackConfigCache.fetch(tenantId);

    if (!config?.callbackBaseUrl) {
      logWarn("TenantGateway", "Tenant chưa cấu hình callbackBaseUrl (DRY-RUN)", { tenantId });
      return null;
    }

    return createTenantGatewayClient({
      callbackBaseUrl: config.callbackBaseUrl,
      apiKey: config.apiKey ?? "",
      tenantId: config.tenantId,
      timeout: DEFAULT_TIMEOUT,
    });
  },

  /**
   * Xoá cache config cho 1 tenant — gọi khi admin update callbackBaseUrl hoặc
   * rotate API key. Request tiếp theo sẽ re-resolve từ DB.
   *
   * Khi bật Redis (L2), xoá cả entry Redis → mọi process thấy config mới ngay.
   */
  async invalidate(tenantId: string): Promise<void> {
    await tenantCallbackConfigCache.invalidate(tenantId);
  },

  /** Xoá toàn bộ cache config — dùng khi deploy hoặc bulk config change. */
  async invalidateAll(): Promise<void> {
    await tenantCallbackConfigCache.invalidateAll();
  },
} as const;

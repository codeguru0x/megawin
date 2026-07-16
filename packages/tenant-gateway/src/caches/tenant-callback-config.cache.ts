/**
 * Cache callback config của tenant — thay LRU-cache-object cũ ở gateway.ts.
 *
 * Cache DATA (config JSON-serializable), KHÔNG cache TenantGatewayClient:
 * - Client chỉ là wrapper mỏng quanh `fetch` (không socket/pool) → tạo lại mỗi
 *   lần gần như free. Cái đắt là DB query lấy config → đó mới là thứ cache.
 * - Config JSON-safe → chạy được cả L1 memory lẫn L2 Redis (tiered). Cache client
 *   object sẽ mất method khi serialize qua Redis → chỉ chạy được L1.
 *
 * Dùng `createCachedFetcher` để thừa hưởng miễn phí:
 * - SINGLE-FLIGHT : concurrent getClient cùng tenant chỉ query DB 1 lần.
 * - STALE-ON-ERROR: DB lỗi → trả config cũ trong process (config hiếm đổi).
 * - NEGATIVE CACHE: tenant chưa setup → cache `null`, không dội DB mỗi lần.
 *
 * ⚠️ Bảo mật: `apiKey` nằm trong value. Khi bật `REDIS_URI`, apiKey được lưu
 * plaintext trong Redis nội bộ (đánh đổi có chủ đích để có cross-invocation
 * cache trên Lambda). Redis phải nằm trong VPC private, không expose ra ngoài.
 */

import { createCachedFetcher, getDefaultCacheStore } from "@megawin/cache";
import { TenantCallbackConfigRepo } from "../infras/repos/tenant-callback-config-repo";
import type { TenantCallbackConfig } from "../infras/repos/types";
import { TENANT_GW_CACHE_KEYS } from "./keys";

/**
 * TTL cache config (giây).
 *
 * 10 phút: callbackBaseUrl + apiKey gần như không đổi giữa các kỳ quay.
 * Trade-off: admin rotate apiKey → config cũ dùng tối đa 10 phút. Workaround:
 * gọi `tenantGateway.invalidate(tenantId)` ngay sau khi update config.
 */
const CONFIG_TTL_SEC = 10 * 60;

let repo: TenantCallbackConfigRepo | null = null;

function getRepo(): TenantCallbackConfigRepo {
  if (!repo) {
    repo = new TenantCallbackConfigRepo();
  }

  return repo;
}

/**
 * Fetcher cache callback config theo tenantId — read-through, single-flight.
 *
 * Loader trả `null` khi tenant không tồn tại HOẶC chưa setup `callbackBaseUrl`
 * (2 trường hợp đều là "không dispatch được"). `null` được negative-cache nên
 * tenant chưa cấu hình cũng không dội DB liên tục.
 */
export const tenantCallbackConfigCache = createCachedFetcher<string, TenantCallbackConfig | null>(
  async (tenantId) => {
    const config = await getRepo().getCallbackConfig(tenantId);
    // Thiếu callbackBaseUrl = coi như chưa setup → null (dùng chung nhánh negative cache).
    if (!config?.callbackBaseUrl) {
      return null;
    }

    return config;
  },
  {
    store: getDefaultCacheStore(),
    keyPrefix: TENANT_GW_CACHE_KEYS.callbackConfig,
    ttlSec: CONFIG_TTL_SEC,
  },
);

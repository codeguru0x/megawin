/**
 * Pre-configured tenant API key auth middleware.
 *
 * Bind sẵn TenantRepository lookup — handler chỉ cần:
 *   import { tenantAuth } from "@megawin/identity-application/shared";
 *   middy(handler).use(tenantAuth())
 */

import {
  tenantApiKeyAuthMiddleware,
  type TenantApiKeyAuthOptions,
} from "@megawin/app-core/lambda/middleware";

import { TenantRepository } from "../infras/repos/tenant-repo";

const TENANT_AUTH_PROJECTION = {
  tenantId: 1,
  displayName: 1,
  status: 1,
  apiKey: 1,
} as const;

const tenantRepo = new TenantRepository();

async function getTenantByApiKey(tenantId: string) {
  return tenantRepo.getTenantById(tenantId, TENANT_AUTH_PROJECTION);
}

/**
 * Middleware xác thực tenant API key — dùng chung cho mọi
 * server-to-server endpoint (api-identity, api-tenant, api-player).
 *
 * Đã bind sẵn TenantRepository lookup. Chỉ cần `.use(tenantAuth())`.
 *
 * @param overrides - Ghi đè options nếu cần (vd: allowedStatuses).
 */
export function tenantAuth(
  overrides?: Partial<Omit<TenantApiKeyAuthOptions, "getTenant">>
) {
  return tenantApiKeyAuthMiddleware({
    getTenant: getTenantByApiKey,
    ...overrides,
  });
}

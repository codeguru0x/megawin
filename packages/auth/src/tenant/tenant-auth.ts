/**
 * Pre-configured tenant API key auth middleware.
 * Bind sẵn TenantRepository lookup.
 */

import { TenantRepository } from "@megawin/identity-application/repos";
import {
  tenantApiKeyAuthMiddleware,
  type TenantApiKeyAuthOptions,
} from "../tenant-api-key-auth";

const TENANT_AUTH_PROJECTION = {
  tenantId: 1,
  displayName: 1,
  status: 1,
  apiKey: 1,
} as const;

const tenantRepo = new TenantRepository();

async function lookupTenantByApiKey(apiKey: string) {
  return tenantRepo.getTenantByApiKey(apiKey, TENANT_AUTH_PROJECTION);
}

export function tenantAuth(
  overrides?: Partial<Omit<TenantApiKeyAuthOptions, "getTenantByApiKey">>,
) {
  return tenantApiKeyAuthMiddleware({
    getTenantByApiKey: lookupTenantByApiKey,
    ...overrides,
  });
}

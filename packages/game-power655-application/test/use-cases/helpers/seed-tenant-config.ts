import { TenantConfigRepository } from "../../../src/infras/repos/tenant-config-repo";
import { DEFAULT_POWER655_CONFIG } from "@megawin/game-power655/rules";
import type { TenantConfigEntity } from "@megawin/game-power655/entities";

/**
 * Insert/update tenant config cho testing.
 * Dùng upsert nên idempotent.
 */
export async function seedTenantConfig(
  tenantId: string,
  overrides?: {
    commissionRate?: number;
    isEnabled?: boolean;
  },
): Promise<TenantConfigEntity> {
  const repo = new TenantConfigRepository();

  const result = await repo.upsertTenantConfig(tenantId, {
    commissionRate: overrides?.commissionRate ?? DEFAULT_POWER655_CONFIG.rates.defaultCommissionRate,
    isEnabled: overrides?.isEnabled ?? true,
  });

  if (!result) {
    throw new Error(`Failed to seed tenant config for ${tenantId}`);
  }

  return result;
}

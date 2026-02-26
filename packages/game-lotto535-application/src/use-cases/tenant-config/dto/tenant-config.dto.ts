import type { TenantConfigEntity } from "../../../infras/mappers/tenant-config-mapper";

// ─────────────────────────────────────────────
// ListTenantConfigs
// ─────────────────────────────────────────────

export interface ListTenantConfigsOutput {
  configs: TenantConfigEntity[];
}

// ─────────────────────────────────────────────
// GetTenantConfig
// ─────────────────────────────────────────────

export interface GetTenantConfigInput {
  tenantId: string;
}

export interface GetTenantConfigOutput {
  config: TenantConfigEntity;
}

// ─────────────────────────────────────────────
// UpdateTenantConfig
// ─────────────────────────────────────────────

export interface UpdateTenantConfigInput {
  tenantId: string;
  commissionRate?: number;
  isEnabled?: boolean;
}

export interface UpdateTenantConfigOutput {
  config: TenantConfigEntity;
  version: number;
}

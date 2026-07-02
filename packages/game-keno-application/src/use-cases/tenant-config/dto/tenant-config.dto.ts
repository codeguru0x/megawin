import type { TenantConfigEntity } from "@megawin/game-keno/entities";
import type { AuditActor } from "@megawin/audit/logger";

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
  /** Chủ thể thực hiện — dùng cho audit. */
  actor: AuditActor;
}

export interface UpdateTenantConfigOutput {
  config: TenantConfigEntity;
  version: number;
}

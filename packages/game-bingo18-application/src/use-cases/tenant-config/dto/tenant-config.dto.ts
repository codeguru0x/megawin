import type { TenantConfigEntity } from "../../../infras/mappers/game-config-mapper";

// ─────────────────────────────────────────────
// ListTenantConfigs
// ─────────────────────────────────────────────

export interface ListTenantConfigsOutput {
  /** Danh sách cấu hình tất cả tenant. */
  configs: TenantConfigEntity[];
}

// ─────────────────────────────────────────────
// GetTenantConfig
// ─────────────────────────────────────────────

export interface GetTenantConfigInput {
  /** ID tenant cần lấy cấu hình. */
  tenantId: string;
}

export interface GetTenantConfigOutput {
  /** Cấu hình của tenant. */
  config: TenantConfigEntity;
}

// ─────────────────────────────────────────────
// UpdateTenantConfig
// ─────────────────────────────────────────────

export interface UpdateTenantConfigInput {
  /** ID tenant cần cập nhật. */
  tenantId: string;
  /** Tỷ lệ hoa hồng đại lý (0-1). Ghi đè defaultCommissionRate. */
  commissionRate?: number;
  /** Bật/tắt tenant cho game Bingo 18. */
  isEnabled?: boolean;
}

export interface UpdateTenantConfigOutput {
  /** Cấu hình tenant sau khi cập nhật. */
  config: TenantConfigEntity;
  /** Version tự increment mỗi lần update. */
  version: number;
}

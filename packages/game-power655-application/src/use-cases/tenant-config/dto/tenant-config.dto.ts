import type { TenantConfigEntity } from "@megawin/game-power655/entities";

// ─────────────────────────────────────────────
// ListTenantConfigs
// ─────────────────────────────────────────────

export interface ListTenantConfigsOutput {
  /** Danh sách cấu hình tất cả tenant đã đăng ký game Power 6/55. */
  configs: TenantConfigEntity[];
}

// ─────────────────────────────────────────────
// GetTenantConfig
// ─────────────────────────────────────────────

export interface GetTenantConfigInput {
  /** ID của tenant (đại lý) cần lấy cấu hình. */
  tenantId: string;
}

export interface GetTenantConfigOutput {
  /** Cấu hình Power 6/55 của tenant. */
  config: TenantConfigEntity;
}

// ─────────────────────────────────────────────
// UpdateTenantConfig
// ─────────────────────────────────────────────

export interface UpdateTenantConfigInput {
  /** ID của tenant cần cập nhật cấu hình. */
  tenantId: string;
  /** Tỷ lệ hoa hồng riêng cho tenant (0-1). Ghi đè defaultCommissionRate nếu có. */
  commissionRate?: number;
  /** Bật/tắt tenant tham gia game Power 6/55. */
  isEnabled?: boolean;
}

export interface UpdateTenantConfigOutput {
  /** Cấu hình tenant sau khi cập nhật. */
  config: TenantConfigEntity;
  /** Phiên bản mới của cấu hình (tăng dần mỗi lần update). */
  version: number;
}

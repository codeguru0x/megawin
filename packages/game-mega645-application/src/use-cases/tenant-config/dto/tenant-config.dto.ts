import type { TenantConfigEntity } from "../../../infras/mappers/tenant-config-mapper";

// ─────────────────────────────────────────────
// ListTenantConfigs
// ─────────────────────────────────────────────

export interface ListTenantConfigsOutput {
  /** Danh sách cấu hình tất cả tenant đang tham gia game Mega 6/45. */
  configs: TenantConfigEntity[];
}

// ─────────────────────────────────────────────
// GetTenantConfig
// ─────────────────────────────────────────────

export interface GetTenantConfigInput {
  /** ID tenant cần truy vấn. */
  tenantId: string;
}

export interface GetTenantConfigOutput {
  /** Cấu hình tenant cho game Mega 6/45. */
  config: TenantConfigEntity;
}

// ─────────────────────────────────────────────
// UpdateTenantConfig
// ─────────────────────────────────────────────

export interface UpdateTenantConfigInput {
  /** ID tenant cần cập nhật cấu hình. */
  tenantId: string;
  /** Tỷ lệ hoa hồng cho tenant (0-1), ví dụ 0.15 = 15%. Ghi đè defaultCommissionRate. */
  commissionRate?: number;
  /** Bật/tắt tenant tham gia game Mega 6/45. */
  isEnabled?: boolean;
}

export interface UpdateTenantConfigOutput {
  /** Cấu hình tenant sau khi cập nhật. */
  config: TenantConfigEntity;
  /** Phiên bản config mới (tăng dần, dùng cho optimistic locking). */
  version: number;
}

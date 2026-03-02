import type { TenantConfigEntity } from "../../../infras/mappers/tenant-config-mapper";

// ─────────────────────────────────────────────
// ListTenantConfigs
// ─────────────────────────────────────────────

export interface ListTenantConfigsOutput {
  /** Danh sách cấu hình tenant (tất cả tenant đã đăng ký). */
  configs: TenantConfigEntity[];
}

// ─────────────────────────────────────────────
// GetTenantConfig
// ─────────────────────────────────────────────

export interface GetTenantConfigInput {
  /** Mã định danh tenant cần lấy cấu hình. */
  tenantId: string;
}

export interface GetTenantConfigOutput {
  /** Cấu hình tenant (full entity từ DB). */
  config: TenantConfigEntity;
}

// ─────────────────────────────────────────────
// UpdateTenantConfig
// ─────────────────────────────────────────────

export interface UpdateTenantConfigInput {
  /** Mã định danh tenant cần cập nhật. */
  tenantId: string;
  /**
   * Tỷ lệ hoa hồng riêng cho tenant (0-1).
   * Nếu không set, dùng defaultCommissionRate từ GlobalConfig.
   */
  commissionRate?: number;
  /** Bật/tắt tenant — tenant bị tắt không thể đặt cược. */
  isEnabled?: boolean;
}

export interface UpdateTenantConfigOutput {
  /** Cấu hình tenant sau khi cập nhật (full entity). */
  config: TenantConfigEntity;
  /** Phiên bản mới sau khi cập nhật (optimistic locking). */
  version: number;
}

export const TenantStatus = {
  /** Hoạt động bình thường */
  Active: "active",
  /** Bị vô hiệu hóa, cấm hoạt động */
  Disabled: "disabled",
} as const;

export type TenantStatus = (typeof TenantStatus)[keyof typeof TenantStatus];

export const TENANT_STATUS_VALUES = Object.values(TenantStatus);

export interface TenantEntity {
  id: string;

  /**
   * Unique identifier (lowercase, alphanumeric).
   * Dùng để map giữa các hệ thống. Ví dụ: "one"
   */
  tenantId: string;

  displayName: string;

  description?: string;

  status: TenantStatus;

  /**
   * API key dùng để xác thực request giữa 2 bên.
   * Sinh tự động khi tạo tenant, có thể regenerate.
   */
  apiKey: string;

  /**
   * Thời điểm rotate API key gần nhất.
   */
  apiKeyLastRotatedAt: Date;

  /**
   * Base URL của callback API phía tenant.
   * MegaWin gọi ngược tenant server qua URL này (debit/credit/rollback...).
   * Ví dụ: "https://api.acme-gaming.com"
   */
  callbackBaseUrl: string;

  createdAt: Date;
  updatedAt: Date;
}

/**
 * DTO rút gọn dùng cho select/dropdown ở các page khác.
 */
export interface TenantOption {
  tenantId: string;
  displayName: string;
  status: TenantStatus;
}

export const TenantStatus = {
  /** Hoạt động bình thường */
  Active: "active",
  /** Bị vô hiệu hóa, cấm hoạt động */
  Disabled: "disabled",
} as const;

export type TenantStatus = (typeof TenantStatus)[keyof typeof TenantStatus];

export const TENANT_STATUS_VALUES = Object.values(TenantStatus);

export interface TenantJwksAssertionConfig {
  /**
   * Issuer của tenant — mặc định = tenantId.
   */
  issuer: string;

  /**
   * URL của JWKS endpoint.
   * Ví dụ: https://customer.com/.well-known/jwks.json
   */
  jwksUrl: string;

  /**
   * Clock skew cho phép (giây). Mặc định 5.
   */
  clockSkewSec?: number;

  /**
   * TTL tối đa của assertion token (giây). Mặc định 120.
   */
  maxTtlSec?: number;

  /**
   * Replay window cho jti dedupe (giây). Mặc định 300.
   */
  replayWindowSec?: number;
}

export interface TenantApp {
  /**
   * Danh sách origins được phép.
   * Bắt buộc >= 1, không trùng nhau.
   */
  allowedOrigins: string[];
}

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
   * Config JWKS Assertion để xác thực quyền player.
   */
  sso: TenantJwksAssertionConfig;

  /**
   * Config app (origins, etc.)
   */
  app: TenantApp;

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

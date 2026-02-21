export enum TenantStatus {
  /**
   * Tenant is active
   * Hoạt động bình thường
   */
  ACTIVE = "active",

  /**
   * Tenant is disabled
   * Bị vô hiệu quá, cấm hoạt động
   */
  DISABLED = "disabled",

  /**
   * Tenant is suspended
   * Bị tạm dừng hoạt động.
   * Không thể thực hiện các thao tác WRITE data.
   * Chỉ cho phép vào READ 1 số dữ liệu như số liệu thống kê
   */
  SUSPENDED = "suspended",
}

export interface TenantJwksAssertionConfig {
  /**
   * Issuer của tenant.
   * Đây chính là tenantId.
   */
  issuer: string; // khuyên = tenantId (ví dụ: one)

  /**
   * Audience của tenant.
   * Chống lại việc token được sử dụng cho tenant khác.
   * Bắt buộc đối tác phải dùng "megawin" làm audience.
   */
  //audience: string;

  /**
   * Url của JWKS.
   * Ví dụ: https://customer.com/.well-known/jwks.json
   */
  jwksUrl: string;

  /**
   * Algorithms của tenant.
   * Mặc định là ["RS256"].
   * Bắt buộc đối tác phải dùng RS256.
   */
  //algs?: ("RS256" | "ES256")[];

  /**
   * Clock skew seconds.
   * Mặc định là 5.
   */
  clockSkewSec?: number;

  /**
   * Max TTL seconds.
   * Mặc định là 120.
   */
  maxTtlSec?: number;

  /**
   * Replay window seconds.
   * Mặc định là 300 (jti dedupe).
   */
  replayWindowSec?: number;
}

export interface TenantApp {
  /**
   * Origins của app.
   * Cho phép origins nào để app được sử dụng.
   * Bắt buộc phải có ít nhất 1 origin và không được trùng nhau.
   * https://example.com,
   */
  allowedOrigins: string[];
}

export interface TenantEntity {
  /**
   * Mongodb Id của tenant.
   */
  id: string;

  /**
   * Id của tenant. Dùng map trong các hệ thống khác.
   * Ví dụ: one
   * Chỉ cho phép AlphaNumeric
   * tenantId: này được lowercase chỉ cho phép AlphaNumeric
   */
  tenantId: string;

  /**
   * Tên của tenant.
   * Ví dụ: "One"
   */
  displayName: string;

  /**
   * Mô tả của tenant.
   */
  description?: string;

  /**
   * Trạng thái của tenant.
   * active: tenant is active
   * disabled: tenant is disabled
   * suspended: tenant is suspended
   */
  status: TenantStatus;

  /**
   * Config của SSO.
   * Config để xác thực token từ đối tác.
   */
  sso: TenantJwksAssertionConfig;

  /**
   * Apps của tenant.
   * Cho phép apps nào để app được sử dụng.
   * Bắt buộc phải có ít nhất 1 app và không được trùng nhau.
   */
  app: TenantApp[];

  /**
   * Thời gian tạo tenant.
   */
  createdAt: Date;

  /**
   * Thời gian cập nhật tenant.
   */
  updatedAt: Date;
}

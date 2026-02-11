/**
 * Account kind
 * player: account is a player
 * internal: account is an internal account (company or tenant account)
 */
export enum AccountKind {
  Player = "player",
  Internal = "internal",
}

/**
 * Account status
 * active: account is active
 * blocked: account is blocked
 * disabled: account is disabled
 */
export enum AccountStatus {
  Active = "active",
  Blocked = "blocked",
  Disabled = "disabled",
}

/**
 * Account scope type
 * company: account is a company account
 * tenant: account is a tenant account
 */
export enum AccountScope {
  Company = "company",
  Tenant = "tenant",
}

/**
 * Account entity
 */
export interface AccountEntity {
  /**
   * Mongodb Id của account.
   */
  id: string;

  /**
   * Id của account.
   * Dùng ULID hoặc UUID
   * Phục vụ nhiều nơi không chỉ mongodb
   */
  accountId: string;

  /**
   *
   * Nếu kind ="player" thì đây là Full user id của đối tác theo format : [tenant-id]:[subject] (ví dụ: 1234567890:john)
   * Nếu kind ="internal" thì đây là username của tài khoản của công ty hoặc đối tác.
   * username: này được lowercase chỉ cho phép AlphaNumeric
   */
  username: string;

  /**
   * Tên hiển thị của account.
   * Mặc định là username bỏ phần "[tenant-id]:"
   */
  displayName: string;

  /**
   * Loại tài khoản. Player hoặc Internal.
   */
  kind: AccountKind;

  /**
   * Trạng thái của account
   */
  status: AccountStatus;

  /**
   * Phạm vi của account.
   * Tài khoản nội bộ là tài khoản của công ty hoặc đối tác.
   */
  scope: AccountScope;

  /**
   * Id của tenant.
   * Bắt buộc phải có giá trị nếu scope là "tenant".
   */
  tenantId?: string;

  /**
   * Thông tin Cognito của account.
   */
  /**
   * Id của pool Cognito.
   */
  cognitoPoolId: string;

  /**
   * Id của user trong pool Cognito.
   */
  cognitoSub: string;

  /**
   * Username của user trong pool Cognito.
   * Format: [tenant-id]:[username] (ví dụ: 1234567890:john)
   * Mặc định dùng theo format của externalId
   */
  cognitoUsername: string;

  /**
   * Thời gian tạo account.
   */
  createdAt: Date;

  /**
   * Thời gian cập nhật account.
   */
  updatedAt: Date;
}

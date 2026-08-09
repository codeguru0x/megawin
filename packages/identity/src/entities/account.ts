// ─── Account Type (discriminator) ───

export const AccountType = {
  Company: "company",
  Agent: "agent",
  Player: "player",
} as const;

export type AccountType = (typeof AccountType)[keyof typeof AccountType];

// ─── Account Status ───

export const AccountStatus = {
  /** Hoạt động bình thường – đọc + ghi. */
  Active: "active",
  /** Chỉ xem – login được nhưng mọi mutation (POST/PUT/DELETE) bị chặn. */
  ReadOnly: "read_only",
  /** Khoá hoàn toàn – không thể login. Cognito user bị disable. */
  Suspended: "suspended",
} as const;

export type AccountStatus = (typeof AccountStatus)[keyof typeof AccountStatus];

// ─── Roles gắn chặt với từng loại tài khoản ───

/**
 * Tài khoản công ty: admin, staff (mở rộng thêm ở đây khi cần).
 * Ví dụ thêm Manager: `Manager: "manager"` rồi Cognito group tương ứng.
 */
export const CompanyRole = {
  Admin: "admin",
  Staff: "staff",
} as const;

export type CompanyRole = (typeof CompanyRole)[keyof typeof CompanyRole];

/** Tài khoản đại lý. */
export const AgentRole = {
  Agent: "agent",
} as const;

export type AgentRole = (typeof AgentRole)[keyof typeof AgentRole];

/** Tài khoản người chơi. */
export const PlayerRole = {
  Player: "player",
} as const;

export type PlayerRole = (typeof PlayerRole)[keyof typeof PlayerRole];

/** Union tất cả roles – dùng khi cần so sánh chung. */
export type AccountRole = CompanyRole | AgentRole | PlayerRole;

// ─── Helpers để lấy danh sách role values tại runtime ───

export const COMPANY_ROLE_VALUES = Object.values(CompanyRole);
export const AGENT_ROLE_VALUES = Object.values(AgentRole);
export const PLAYER_ROLE_VALUES = Object.values(PlayerRole);
export const ALL_ROLE_VALUES = [...COMPANY_ROLE_VALUES, ...AGENT_ROLE_VALUES, ...PLAYER_ROLE_VALUES] as const;

/**
 * Super roles: bypass mọi role check khi đã authed.
 * Admin luôn có quyền truy cập tất cả route mà không cần khai báo.
 */
export const SUPER_ROLES: readonly AccountRole[] = [CompanyRole.Admin];

// ─── MFA Status ───

export const MfaStatus = {
  /** Mới tạo, chưa từng thiết lập MFA. */
  None: "none",
  /** MFA đang bật – yêu cầu OTP khi login. */
  Enabled: "enabled",
  /** Đã từng bật MFA nhưng đã tắt. */
  Disabled: "disabled",
} as const;

export type MfaStatus = (typeof MfaStatus)[keyof typeof MfaStatus];

// ─── Base entity fields chung ───

interface AccountBase {
  /** MongoDB _id */
  id: string;

  /** ULID / UUID – portable ID dùng ngoài MongoDB. */
  accountId: string;

  /**
   * Player: full user id format `[tenantId]:[subject]`.
   * Company / Agent: username lowercase alphanumeric.
   */
  username: string;

  /** Tên hiển thị (mặc định = username bỏ prefix tenantId). */
  displayName: string;

  status: AccountStatus;

  mfaStatus?: MfaStatus;

  cognitoPoolId: string;
  cognitoSub: string;

  /**
   * Username trong Cognito pool.
   * Format: `[tenantId]:[username]` hoặc plain username.
   */
  cognitoUsername: string;

  createdAt: Date;
  updatedAt: Date;
}

// ─── Discriminated Union – mỗi variant enforce đúng constraints ───

export interface CompanyAccountEntity extends AccountBase {
  type: typeof AccountType.Company;
  roles: CompanyRole[];
  tenantId?: never;
}

export interface AgentAccountEntity extends AccountBase {
  type: typeof AccountType.Agent;
  roles: AgentRole[];
  tenantId: string;
}

export interface PlayerAccountEntity extends AccountBase {
  type: typeof AccountType.Player;
  roles: PlayerRole[];
  tenantId: string;
}

/** Union type chính – dùng ở repository, mapper, use case. */
export type AccountEntity = CompanyAccountEntity | AgentAccountEntity | PlayerAccountEntity;

import type { AccountStatus, AccountType, AgentRole, CompanyRole, MfaStatus } from "./account";

export const AccountTypeLabel: Record<AccountType, string> = {
  company: "Công ty",
  agent: "Đại lý",
  player: "Người chơi",
} as const;

export const AccountStatusLabel: Record<AccountStatus, string> = {
  active: "Hoạt động",
  read_only: "Chỉ đọc",
  suspended: "Bị khoá",
} as const;

export const CompanyRoleLabel: Record<CompanyRole, string> = {
  admin: "Quản trị viên",
  staff: "Nhân viên",
} as const;

export const AgentRoleLabel: Record<AgentRole, string> = {
  agent: "Đại lý",
} as const;

export const MfaStatusLabel: Record<MfaStatus, string> = {
  none: "Chưa thiết lập",
  enabled: "Đang bật",
  disabled: "Đã tắt",
} as const;

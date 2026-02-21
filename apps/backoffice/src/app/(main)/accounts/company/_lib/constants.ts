import {
  CompanyRole,
  COMPANY_ROLE_VALUES,
} from "@megawin/identity-domain/accounts/account";

export const COMPANY_ROLES_OPTIONS: { value: CompanyRole; label: string }[] = [
  { value: CompanyRole.Admin, label: "Quản trị viên" },
  { value: CompanyRole.Staff, label: "Nhân viên" },
];

export { COMPANY_ROLE_VALUES };

import { CompanyRole } from "@megawin/identity/entities";

export const COMPANY_ROLES_OPTIONS: { value: CompanyRole; label: string }[] = [
  { value: CompanyRole.Admin, label: "Quản trị viên" },
  { value: CompanyRole.Staff, label: "Nhân viên" },
];

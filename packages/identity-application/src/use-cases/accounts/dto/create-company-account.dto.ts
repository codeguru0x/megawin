import type { CompanyRole } from "@megawin/identity/entities/account";

export interface CreateCompanyAccountInput {
  username: string;
  password: string;
  roles: CompanyRole[];
}

export interface CreateCompanyAccountOutput {
  userId: string;
  username: string;
  roles: CompanyRole[];
}

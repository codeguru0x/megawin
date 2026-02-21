import type { CompanyAccount } from "./schema";
import type { CompanyRole } from "@megawin/identity-domain/accounts/account";

export interface ListCompanyAccountsResponse {
  accounts: CompanyAccount[];
}

export interface CreateCompanyAccountResponse {
  userId: string;
  username: string;
  roles: CompanyRole[];
}

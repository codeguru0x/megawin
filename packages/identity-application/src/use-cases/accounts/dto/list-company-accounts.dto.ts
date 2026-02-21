import type { AccountStatus, CompanyRole } from "@megawin/identity-domain/accounts/account";

export interface CompanyAccountItem {
  accountId: string;
  username: string;
  displayName: string;
  status: AccountStatus;
  roles: CompanyRole[];
  createdAt: string;
  updatedAt: string;
}

export interface ListCompanyAccountsOutput {
  accounts: CompanyAccountItem[];
}

import type { AccountStatus, CompanyRole, MfaStatus } from "@megawin/identity/entities";

export interface CompanyAccountItem {
  accountId: string;
  username: string;
  displayName: string;
  status: AccountStatus;
  mfaStatus: MfaStatus;
  roles: CompanyRole[];
  createdAt: string;
  updatedAt: string;
}

export interface ListCompanyAccountsOutput {
  accounts: CompanyAccountItem[];
}

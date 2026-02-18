import type { CompanyAccount } from "./schema";

export interface ListCompanyAccountsResponse {
  accounts: CompanyAccount[];
  paginationToken?: string;
}

export interface CreateCompanyAccountResponse {
  userId: string;
  username: string;
  roles: string[];
}

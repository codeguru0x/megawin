export interface ListCompanyAccountsInput {
  limit?: number;
  paginationToken?: string;
}

export interface CompanyAccountItem {
  username: string;
  status: string;
  createdAt: string;
  email?: string;
}

export interface ListCompanyAccountsOutput {
  accounts: CompanyAccountItem[];
  paginationToken?: string;
}

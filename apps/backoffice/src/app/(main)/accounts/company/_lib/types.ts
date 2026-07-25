import type { CompanyRole } from "@megawin/identity/entities";

import type { CompanyAccount } from "./schema";

export interface ListCompanyAccountsResponse {
  accounts: CompanyAccount[];
}

export interface CreateCompanyAccountResponse {
  userId: string;
  username: string;
  roles: CompanyRole[];
}

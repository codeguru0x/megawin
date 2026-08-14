import { UseCase } from "@megawin/app-core/use-cases";
import { MfaStatus } from "@megawin/identity/entities";

import { AccountRepository } from "../../infras/repos/account-repo";
import type { CompanyAccountItem, ListCompanyAccountsOutput } from "./dto/list-company-accounts.dto";

export class ListCompanyAccountsUseCase extends UseCase<void, ListCompanyAccountsOutput> {
  protected async execute(): Promise<ListCompanyAccountsOutput> {
    const repo = new AccountRepository();
    const companyAccounts = await repo.listCompanyAccounts();

    const accounts: CompanyAccountItem[] = companyAccounts.map((acc) => ({
      accountId: acc.accountId,
      username: acc.username,
      displayName: acc.displayName,
      status: acc.status,
      mfaStatus: acc.mfaStatus ?? MfaStatus.None,
      roles: acc.roles,
      createdAt: acc.createdAt.toISOString?.() ?? String(acc.createdAt),
      updatedAt: acc.updatedAt.toISOString?.() ?? String(acc.updatedAt),
    }));

    return { accounts };
  }
}

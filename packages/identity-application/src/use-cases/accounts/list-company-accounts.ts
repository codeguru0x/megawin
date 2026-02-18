/**
 * Use case: List company accounts từ Cognito qua Next.js API route.
 *
 * Input: limit?, paginationToken? (query params, đã validate Zod).
 * Output: danh sách accounts + paginationToken.
 */

import { NextApiUseCase } from "@megawin/next/server";
import { adminListUsers } from "@megawin/app-core/aws/cognito";

// ============ DTO ============

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

// ============ Use Case ============

export class ListCompanyAccountsUseCase extends NextApiUseCase<
  ListCompanyAccountsInput,
  ListCompanyAccountsOutput
> {
  protected async execute(
    input: ListCompanyAccountsInput
  ): Promise<ListCompanyAccountsOutput> {
    const result = await adminListUsers({
      limit: input.limit,
      paginationToken: input.paginationToken,
    });

    const accounts: CompanyAccountItem[] = result.users.map((user) => {
      const emailAttr = user.Attributes?.find((a) => a.Name === "email");
      return {
        username: user.Username ?? "",
        status: user.UserStatus ?? "UNKNOWN",
        createdAt: user.UserCreateDate?.toISOString() ?? "",
        email: emailAttr?.Value,
      };
    });

    return {
      accounts,
      paginationToken: result.paginationToken,
    };
  }
}

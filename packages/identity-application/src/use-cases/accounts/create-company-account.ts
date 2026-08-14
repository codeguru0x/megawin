/**
 * Use case: Tạo company account.
 *
 * Input: username, password, roles (đã validate bằng Zod ở route wrapper — roles.min(1) +
 * enum COMPANY_ROLE_VALUES, xem `apps/backoffice/src/app/api/accounts/company/_lib/schema.ts`).
 * Execute: tạo user Cognito + gán groups theo roles.
 */

import { adminCreateAccount, COGNITO_WORKFORCE_POOL_ID } from "@megawin/app-core/aws/cognito";
import { UseCase } from "@megawin/app-core/use-cases";
import { AccountStatus, AccountType, ClaimKey } from "@megawin/identity/entities";
import { AppException } from "@megawin/shared/errors";
import { generateULID } from "@megawin/shared/utils";

import { AccountRepository } from "../../infras/repos/account-repo";
import type { CreateCompanyAccountInput, CreateCompanyAccountOutput } from "./dto/create-company-account.dto";

export class CreateCompanyAccountUseCase extends UseCase<CreateCompanyAccountInput, CreateCompanyAccountOutput> {
  private readonly accountRepo = new AccountRepository();

  protected async execute(input: CreateCompanyAccountInput): Promise<CreateCompanyAccountOutput> {
    const accountId = generateULID();
    const accountStatus = AccountStatus.Active;
    const accountType = AccountType.Company;
    const roles = input.roles;
    // Tên hiển thị là username
    const displayName = input.username;
    // Tên tài khoản là lowercase
    const username = input.username.toLowerCase();

    const result = await adminCreateAccount({
      userPoolId: COGNITO_WORKFORCE_POOL_ID!,
      username: input.username,
      temporaryPassword: input.password,
      messageActionSuppress: true,
      requirePasswordResetOnFirstLogin: true,
      userAttributes: [
        {
          Name: ClaimKey.AccountId,
          Value: accountId,
        },
        {
          Name: ClaimKey.AccountType,
          Value: accountType,
        },
        {
          Name: ClaimKey.AccountStatus,
          Value: accountStatus,
        },
        {
          Name: ClaimKey.Roles,
          Value: roles.join(","),
        },
      ],
    });

    if (!result.User) {
      throw AppException.internal("Tạo tài khoản thất bại");
    }

    const cognitoUsername = result.User.Username ?? input.username;
    const cognitoSub = result.User.Attributes?.find((attr) => attr.Name === ClaimKey.Sub)?.Value ?? cognitoUsername;

    const account = await this.accountRepo.findOrCreateCompanyAccount(
      username,
      displayName,
      accountType,
      roles,
      accountStatus,
      accountId,
      COGNITO_WORKFORCE_POOL_ID!,
      cognitoSub,
      cognitoUsername,
    );

    if (!account) {
      throw AppException.internal("Lưu thông tin tài khoản thất bại");
    }

    return {
      userId: accountId,
      username: displayName,
      roles: input.roles,
    };
  }
}

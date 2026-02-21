/**
 * Use case: Tạo company account qua Next.js API route.
 *
 * Input: username, password, roles (đã validate bằng Zod ở route wrapper).
 * Execute: tạo user Cognito + gán groups theo roles.
 */

import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import {
  adminCreateAccount,
  COGNITO_WORKFORCE_POOL_ID,
} from "@megawin/app-core/aws/cognito";
import { AccountType, AccountStatus } from "@megawin/identity-domain/accounts";

import type {
  CreateCompanyAccountInput,
  CreateCompanyAccountOutput,
} from "./dto/create-company-account.dto";
import { ClaimKey } from "@megawin/identity-domain/cognito/claim";
import { generateULID } from "@megawin/shared/utils/unique";
import { AccountRepository } from "../../infras/repos/account-repo";

export class CreateCompanyAccountUseCase extends NextApiUseCase<
  CreateCompanyAccountInput,
  CreateCompanyAccountOutput
> {
  /*  protected validate(input: CreateCompanyAccountInput): void | AppError {
    if (input.roles.length === 0) {
      return {
        code: APP_ERROR_CODES.VALIDATION,
        message: "Phải có ít nhất một quyền",
      };
    }

    const invalid = input.roles.filter((r) => !COMPANY_ROLE_VALUES.includes(r));
    if (invalid.length > 0) {
      return {
        code: APP_ERROR_CODES.VALIDATION,
        message: `Invalid roles: ${invalid.join(", ")}`,
        details: { allowedRoles: COMPANY_ROLE_VALUES, invalidRoles: invalid },
      };
    }
  } */

  protected async execute(
    input: CreateCompanyAccountInput
  ): Promise<CreateCompanyAccountOutput> {
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
    const cognitoSub =
      result.User.Attributes?.find((attr) => attr.Name === ClaimKey.Sub)
        ?.Value ?? cognitoUsername;

    const accountRepo = new AccountRepository();
    const account = await accountRepo.findOrCreateCompanyAccount(
      username,
      displayName,
      accountType,
      roles,
      accountStatus,
      accountId,
      COGNITO_WORKFORCE_POOL_ID!,
      cognitoSub,
      cognitoUsername
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

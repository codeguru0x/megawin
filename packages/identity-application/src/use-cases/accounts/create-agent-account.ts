import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import {
  adminCreateAccount,
  COGNITO_WORKFORCE_POOL_ID,
} from "@megawin/app-core/aws/cognito";
import {
  AccountType,
  AccountStatus,
  AgentRole,
} from "@megawin/identity-domain/accounts";

import { ClaimKey } from "@megawin/identity-domain/cognito/claim";
import { generateULID } from "@megawin/shared/utils/unique";
import { AccountRepository } from "../../infras/repos/account-repo";

export interface CreateAgentAccountInput {
  username: string;
  password: string;
  tenantId: string;
}

export interface CreateAgentAccountOutput {
  userId: string;
  username: string;
  tenantId: string;
  roles: AgentRole[];
}

export class CreateAgentAccountUseCase extends NextApiUseCase<
  CreateAgentAccountInput,
  CreateAgentAccountOutput
> {
  protected async execute(
    input: CreateAgentAccountInput
  ): Promise<CreateAgentAccountOutput> {
    const accountRepo = new AccountRepository();

    const existingAgent = await accountRepo.findAgentByTenantId(input.tenantId);
    if (existingAgent) {
      throw AppException.conflict(
        `Tenant "${input.tenantId}" đã có tài khoản đại lý "${existingAgent.username}".`
      );
    }

    const accountId = generateULID();
    const accountStatus = AccountStatus.Active;
    const accountType = AccountType.Agent;
    const roles: AgentRole[] = [AgentRole.Agent];
    const displayName = input.username;
    const username = input.username.toLowerCase();

    const result = await adminCreateAccount({
      userPoolId: COGNITO_WORKFORCE_POOL_ID!,
      username: input.username,
      temporaryPassword: input.password,
      messageActionSuppress: true,
      requirePasswordResetOnFirstLogin: true,
      userAttributes: [
        { Name: ClaimKey.AccountId, Value: accountId },
        { Name: ClaimKey.AccountType, Value: accountType },
        { Name: ClaimKey.AccountStatus, Value: accountStatus },
        { Name: ClaimKey.Roles, Value: roles.join(",") },
        { Name: ClaimKey.TenantId, Value: input.tenantId },
      ],
    });

    if (!result.User) {
      throw AppException.internal("Tạo tài khoản agent thất bại");
    }

    const cognitoUsername = result.User.Username ?? input.username;
    const cognitoSub =
      result.User.Attributes?.find((attr) => attr.Name === ClaimKey.Sub)
        ?.Value ?? cognitoUsername;

    const account = await accountRepo.findOrCreateAgentAccount(
      username,
      displayName,
      roles,
      input.tenantId,
      COGNITO_WORKFORCE_POOL_ID!,
      cognitoSub,
      cognitoUsername
    );

    if (!account) {
      throw AppException.internal("Lưu thông tin tài khoản agent thất bại");
    }

    return {
      userId: accountId,
      username: displayName,
      tenantId: input.tenantId,
      roles,
    };
  }
}

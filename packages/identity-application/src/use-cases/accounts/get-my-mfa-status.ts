import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import {
  adminGetUserMfaStatus,
  COGNITO_WORKFORCE_POOL_ID,
} from "@megawin/app-core/aws/cognito";
import { MfaStatus } from "@megawin/identity/entities/account";
import { AccountRepository } from "../../infras/repos/account-repo";

export interface GetMyMfaStatusInput {
  username: string;
}

export interface GetMyMfaStatusOutput {
  mfaStatus: MfaStatus;
  cognitoMfaEnabled: boolean;
  preferredMethod: string | null;
}

export class GetMyMfaStatusUseCase extends NextApiUseCase<
  GetMyMfaStatusInput,
  GetMyMfaStatusOutput
> {
  protected async execute(
    input: GetMyMfaStatusInput
  ): Promise<GetMyMfaStatusOutput> {
    if (!COGNITO_WORKFORCE_POOL_ID) {
      throw AppException.internal("Cognito pool configuration is missing");
    }

    const [cognitoStatus, repo] = await Promise.all([
      adminGetUserMfaStatus({
        userPoolId: COGNITO_WORKFORCE_POOL_ID,
        username: input.username,
      }),
      Promise.resolve(new AccountRepository()),
    ]);

    const accounts = await repo.findMany({ username: input.username });
    const account = accounts[0];
    const dbMfaStatus = account?.mfaStatus ?? MfaStatus.None;

    return {
      mfaStatus: dbMfaStatus,
      cognitoMfaEnabled: cognitoStatus.enabled,
      preferredMethod: cognitoStatus.preferredMfaSetting ?? null,
    };
  }
}

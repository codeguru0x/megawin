import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import {
  adminVerifySoftwareToken,
  adminUpdateMfa,
  COGNITO_WORKFORCE_POOL_ID,
} from "@megawin/app-core/aws/cognito";
import { MfaStatus } from "@megawin/identity/entities/account";
import { AccountRepository } from "../../infras/repos/account-repo";

export interface VerifyAndEnableMfaInput {
  username: string;
  totpCode: string;
  accessToken: string;
}

export interface VerifyAndEnableMfaOutput {
  success: boolean;
}

export class VerifyAndEnableMfaUseCase extends NextApiUseCase<
  VerifyAndEnableMfaInput,
  VerifyAndEnableMfaOutput
> {
  protected async execute(
    input: VerifyAndEnableMfaInput
  ): Promise<VerifyAndEnableMfaOutput> {
    if (!COGNITO_WORKFORCE_POOL_ID) {
      throw AppException.internal("Cognito pool configuration is missing");
    }

    try {
      const verifyResult = await adminVerifySoftwareToken({
        userCode: input.totpCode,
        accessToken: input.accessToken,
        friendlyDeviceName: `${input.username}@mw`,
      });

      if (verifyResult.status !== "SUCCESS") {
        throw AppException.badRequest(
          "Mã xác thực không hợp lệ. Vui lòng thử lại."
        );
      }
    } catch (error: unknown) {
      if (error instanceof AppException) throw error;

      const errName =
        error instanceof Error ? error.constructor.name : "UnknownError";

      if (
        errName === "EnableSoftwareTokenMFAException" ||
        errName === "CodeMismatchException"
      ) {
        throw AppException.badRequest(
          "Mã xác thực không đúng. Vui lòng kiểm tra lại app Authenticator."
        );
      }

      throw AppException.internal(
        `Xác thực MFA thất bại: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }

    await adminUpdateMfa({
      userPoolId: COGNITO_WORKFORCE_POOL_ID,
      username: input.username,
      enabled: true,
    });

    const repo = new AccountRepository();
    await repo.updateMfaStatus(input.username, MfaStatus.Enabled);

    return { success: true };
  }
}

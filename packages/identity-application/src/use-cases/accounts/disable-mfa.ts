import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import {
  adminInitiateAuth,
  adminUpdateMfa,
  adminVerifySoftwareToken,
  COGNITO_WORKFORCE_POOL_ID,
  COGNITO_WORKFORCE_CLIENT_ID,
} from "@megawin/app-core/aws/cognito";
import { MfaStatus } from "@megawin/identity/entities/account";
import { AccountRepository } from "../../infras/repos/account-repo";

export interface DisableMfaInput {
  username: string;
  password: string;
  totpCode: string;
}

export interface DisableMfaOutput {
  success: boolean;
}

export class DisableMfaUseCase extends NextApiUseCase<DisableMfaInput, DisableMfaOutput> {
  protected async execute(input: DisableMfaInput): Promise<DisableMfaOutput> {
    if (!COGNITO_WORKFORCE_POOL_ID || !COGNITO_WORKFORCE_CLIENT_ID) {
      throw AppException.internal("Cognito pool configuration is missing");
    }

    let accessToken: string;
    try {
      const authResult = await adminInitiateAuth({
        userPoolId: COGNITO_WORKFORCE_POOL_ID,
        clientId: COGNITO_WORKFORCE_CLIENT_ID,
        username: input.username,
        password: input.password,
      });
      accessToken = authResult.accessToken;
    } catch (error: unknown) {
      const errName = error instanceof Error ? error.constructor.name : "UnknownError";

      if (
        errName === "NotAuthorizedException" ||
        (error instanceof Error && error.message.includes("Incorrect username or password"))
      ) {
        throw AppException.badRequest("Mật khẩu không đúng");
      }

      throw AppException.internal(
        `Xác thực thất bại: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }

    try {
      const verifyResult = await adminVerifySoftwareToken({
        userCode: input.totpCode,
        accessToken,
      });

      if (verifyResult.status !== "SUCCESS") {
        throw AppException.badRequest("Mã TOTP không hợp lệ");
      }
    } catch (error: unknown) {
      if (error instanceof AppException) throw error;

      const errName = error instanceof Error ? error.constructor.name : "UnknownError";

      if (errName === "CodeMismatchException" || errName === "EnableSoftwareTokenMFAException") {
        throw AppException.badRequest(
          "Mã xác thực không đúng. Vui lòng kiểm tra lại app Authenticator.",
        );
      }

      throw AppException.internal(
        `Xác thực TOTP thất bại: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }

    await adminUpdateMfa({
      userPoolId: COGNITO_WORKFORCE_POOL_ID,
      username: input.username,
      enabled: false,
    });

    const repo = new AccountRepository();
    await repo.updateMfaStatus(input.username, MfaStatus.Disabled);

    return { success: true };
  }
}

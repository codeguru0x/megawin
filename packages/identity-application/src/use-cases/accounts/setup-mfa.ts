import {
  adminAssociateSoftwareToken,
  adminInitiateAuth,
  COGNITO_WORKFORCE_CLIENT_ID,
  COGNITO_WORKFORCE_POOL_ID,
} from "@megawin/app-core/aws/cognito";
import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";

export interface SetupMfaInput {
  username: string;
  password: string;
}

export interface SetupMfaOutput {
  secretCode: string;
  otpauthUri: string;
  session: string;
  accessToken: string;
}

export class SetupMfaUseCase extends NextApiUseCase<SetupMfaInput, SetupMfaOutput> {
  protected async execute(input: SetupMfaInput): Promise<SetupMfaOutput> {
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

      throw AppException.internal(`Xác thực thất bại: ${error instanceof Error ? error.message : "Unknown error"}`);
    }

    try {
      const result = await adminAssociateSoftwareToken({ accessToken });

      const label = encodeURIComponent(`mw:${input.username}`);
      const otpauthUri = `otpauth://totp/${label}?secret=${result.secretCode}&issuer=mw`;

      return {
        secretCode: result.secretCode,
        otpauthUri,
        session: result.session ?? "",
        accessToken,
      };
    } catch (error: unknown) {
      throw AppException.internal(`Khởi tạo MFA thất bại: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }
}

import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import {
  adminChangeUserPassword,
  COGNITO_WORKFORCE_POOL_ID,
} from "@megawin/app-core/aws/cognito";

export interface ChangeMyPasswordInput {
  username: string;
  currentPassword: string;
  newPassword: string;
}

export interface ChangeMyPasswordOutput {
  success: boolean;
}

export class ChangeMyPasswordUseCase extends NextApiUseCase<
  ChangeMyPasswordInput,
  ChangeMyPasswordOutput
> {
  protected async execute(
    input: ChangeMyPasswordInput
  ): Promise<ChangeMyPasswordOutput> {
    const clientId = process.env.COGNITO_WORKFORCE_USERPOOL_CLIENT_ID;

    if (!COGNITO_WORKFORCE_POOL_ID || !clientId) {
      throw AppException.internal("Cognito pool configuration is missing");
    }

    try {
      await adminChangeUserPassword({
        userPoolId: COGNITO_WORKFORCE_POOL_ID,
        clientId,
        username: input.username,
        currentPassword: input.currentPassword,
        newPassword: input.newPassword,
      });
    } catch (error: unknown) {
      const errName =
        error instanceof Error ? error.constructor.name : "UnknownError";
      const errMessage =
        error instanceof Error ? error.message : "Unknown error";

      if (
        errName === "NotAuthorizedException" ||
        errMessage.includes("Incorrect username or password")
      ) {
        throw AppException.badRequest("Mật khẩu hiện tại không đúng");
      }

      if (errName === "InvalidPasswordException") {
        throw AppException.badRequest(
          "Mật khẩu mới không đáp ứng yêu cầu bảo mật"
        );
      }

      throw AppException.internal(`Đổi mật khẩu thất bại: ${errMessage}`);
    }

    return { success: true };
  }
}

import {
  adminChangeUserPassword,
  COGNITO_WORKFORCE_CLIENT_ID,
  COGNITO_WORKFORCE_POOL_ID,
} from "@megawin/app-core/aws/cognito";
import { UseCase } from "@megawin/app-core/use-cases";
import type { AuditActor } from "@megawin/audit/logger";
import { AppException } from "@megawin/shared/errors";

import { auditChangeOwnPassword } from "../../services/audit-log";

export interface ChangeMyPasswordInput {
  username: string;
  currentPassword: string;
  newPassword: string;
  /** Chủ thể thực hiện (chính chủ tài khoản) — dùng cho audit log self (IP gắn sẵn). */
  actor: AuditActor;
}

export interface ChangeMyPasswordOutput {
  success: boolean;
}

export class ChangeMyPasswordUseCase extends UseCase<ChangeMyPasswordInput, ChangeMyPasswordOutput> {
  protected async execute(input: ChangeMyPasswordInput): Promise<ChangeMyPasswordOutput> {
    if (!COGNITO_WORKFORCE_POOL_ID || !COGNITO_WORKFORCE_CLIENT_ID) {
      throw AppException.internal("Cognito pool configuration is missing");
    }

    try {
      await adminChangeUserPassword({
        userPoolId: COGNITO_WORKFORCE_POOL_ID,
        clientId: COGNITO_WORKFORCE_CLIENT_ID,
        username: input.username,
        currentPassword: input.currentPassword,
        newPassword: input.newPassword,
      });
    } catch (error: unknown) {
      const errName = error instanceof Error ? error.constructor.name : "UnknownError";
      const errMessage = error instanceof Error ? error.message : "Unknown error";

      if (errName === "NotAuthorizedException" || errMessage.includes("Incorrect username or password")) {
        throw AppException.badRequest("Mật khẩu hiện tại không đúng");
      }

      if (errName === "InvalidPasswordException") {
        throw AppException.badRequest("Mật khẩu mới không đáp ứng yêu cầu bảo mật");
      }

      throw AppException.internal(`Đổi mật khẩu thất bại: ${errMessage}`);
    }

    // Audit self SAU khi đổi pass thành công. Chỉ ghi sự kiện — KHÔNG ghi password.
    auditChangeOwnPassword({ actor: input.actor });

    return { success: true };
  }
}

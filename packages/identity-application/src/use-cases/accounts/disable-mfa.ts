import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import {
  adminInitiateAuthWithMfa,
  adminUpdateMfa,
  COGNITO_WORKFORCE_POOL_ID,
  COGNITO_WORKFORCE_CLIENT_ID,
} from "@megawin/app-core/aws/cognito";
import { MfaStatus } from "@megawin/identity/entities";
import type { AuditActor } from "@megawin/audit/logger";
import { AccountRepository } from "../../infras/repos/account-repo";
import { auditDisableMfa } from "../../services/audit-log";

export interface DisableMfaInput {
  username: string;
  password: string;
  totpCode: string;
  /** Chủ thể thực hiện (chính chủ tài khoản) — dùng cho audit log self. */
  actor: AuditActor;
}

export interface DisableMfaOutput {
  success: boolean;
}

export class DisableMfaUseCase extends NextApiUseCase<DisableMfaInput, DisableMfaOutput> {
  protected async execute(input: DisableMfaInput): Promise<DisableMfaOutput> {
    if (!COGNITO_WORKFORCE_POOL_ID || !COGNITO_WORKFORCE_CLIENT_ID) {
      throw AppException.internal("Cognito pool configuration is missing");
    }

    // Xác thực password + TOTP cùng lúc.
    // adminInitiateAuthWithMfa tự xử lý challenge SOFTWARE_TOKEN_MFA nếu user đã bật MFA.
    try {
      await adminInitiateAuthWithMfa({
        userPoolId: COGNITO_WORKFORCE_POOL_ID,
        clientId: COGNITO_WORKFORCE_CLIENT_ID,
        username: input.username,
        password: input.password,
        totpCode: input.totpCode,
      });
    } catch (error: unknown) {
      if (error instanceof AppException) throw error;

      const msg = error instanceof Error ? error.message : "Unknown error";
      const errName = error instanceof Error ? error.constructor.name : "UnknownError";

      if (errName === "NotAuthorizedException" || msg.includes("Incorrect username or password")) {
        throw AppException.badRequest("Mật khẩu không đúng");
      }

      if (errName === "CodeMismatchException" || msg.includes("Code mismatch")) {
        throw AppException.badRequest(
          "Mã xác thực không đúng. Vui lòng kiểm tra lại app Authenticator.",
        );
      }

      throw AppException.internal(`Xác thực thất bại: ${msg}`);
    }

    await adminUpdateMfa({
      userPoolId: COGNITO_WORKFORCE_POOL_ID,
      username: input.username,
      enabled: false,
    });

    const repo = new AccountRepository();
    await repo.updateMfaStatus(input.username, MfaStatus.Disabled);

    // Audit self SAU khi tắt MFA thành công. Chỉ ghi sự kiện — KHÔNG ghi password/TOTP.
    auditDisableMfa({ actor: input.actor });

    return { success: true };
  }
}

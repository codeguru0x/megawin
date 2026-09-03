import { adminUpdateMfa, adminVerifySoftwareToken, COGNITO_WORKFORCE_POOL_ID } from "@megawin/app-core/aws/cognito";
import { UseCase } from "@megawin/app-core/use-cases";
import type { AuditActor } from "@megawin/audit/logger";
import { MfaStatus } from "@megawin/identity/entities";
import { AppException } from "@megawin/shared/errors";
import { logError } from "@megawin/shared/utils";

import { AccountRepository } from "../../infras/repos/account-repo";
import { auditEnableMfa } from "../../services/audit-log";

export interface VerifyAndEnableMfaInput {
  username: string;
  totpCode: string;
  accessToken: string;
  /** Chủ thể thực hiện (chính chủ tài khoản) — dùng cho audit log self (IP gắn sẵn). */
  actor: AuditActor;
}

export interface VerifyAndEnableMfaOutput {
  success: boolean;
}

export class VerifyAndEnableMfaUseCase extends UseCase<VerifyAndEnableMfaInput, VerifyAndEnableMfaOutput> {
  protected async execute(input: VerifyAndEnableMfaInput): Promise<VerifyAndEnableMfaOutput> {
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
        throw AppException.badRequest("Mã xác thực không hợp lệ. Vui lòng thử lại.");
      }
    } catch (error: unknown) {
      if (error instanceof AppException) throw error;

      const errName = error instanceof Error ? error.constructor.name : "UnknownError";

      if (errName === "EnableSoftwareTokenMFAException" || errName === "CodeMismatchException") {
        throw AppException.badRequest("Mã xác thực không đúng. Vui lòng kiểm tra lại app Authenticator.");
      }

      // KHÔNG nhồi error.message (raw Cognito exception) vào AppException — đã là AppException
      // nên UseCase.handleError() cho qua nguyên văn, lộ chi tiết hạ tầng cho client.
      logError("VerifyAndEnableMfaUseCase.adminVerifySoftwareToken", error, { username: input.username });
      throw AppException.internal("Không thể xác thực mã MFA, vui lòng thử lại sau.");
    }

    await adminUpdateMfa({
      userPoolId: COGNITO_WORKFORCE_POOL_ID,
      username: input.username,
      enabled: true,
    });

    const repo = new AccountRepository();
    await repo.updateMfaStatus(input.username, MfaStatus.Enabled);

    // Audit self SAU khi bật MFA thành công. Chỉ ghi sự kiện — KHÔNG ghi secret.
    auditEnableMfa({ actor: input.actor });

    return { success: true };
  }
}

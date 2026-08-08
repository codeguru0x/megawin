import { adminSetUserPassword, COGNITO_WORKFORCE_POOL_ID } from "@megawin/app-core/aws/cognito";
import type { AuditActor } from "@megawin/audit/logger";
import { CompanyRole } from "@megawin/identity/entities";
import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";

import { AccountRepository } from "../../infras/repos/account-repo";
import { auditSetAccountPassword } from "../../services/audit-log";

export interface SetAccountPasswordInput {
  username: string;
  password: string;
  /**
   * Vai trò của tài khoản đang thực hiện thao tác (caller).
   * Dùng để enforce: Staff chỉ đổi pass cho Staff, không đổi cho Admin.
   * Admin (super role) đổi pass cho mọi tài khoản.
   */
  callerRoles: CompanyRole[];
  /** Chủ thể thực hiện (caller) — dùng cho audit log cross-account (IP gắn sẵn). */
  actor: AuditActor;
}

export interface SetAccountPasswordOutput {
  username: string;
}

export class SetAccountPasswordUseCase extends NextApiUseCase<SetAccountPasswordInput, SetAccountPasswordOutput> {
  private readonly accountRepo = new AccountRepository();

  protected async execute(input: SetAccountPasswordInput): Promise<SetAccountPasswordOutput> {
    await this.assertCallerCanSetPassword(input.callerRoles, input.username);

    await adminSetUserPassword({
      userPoolId: COGNITO_WORKFORCE_POOL_ID!,
      username: input.username,
      password: input.password,
      permanent: false,
    });

    // Audit cross-account SAU khi Cognito đổi pass thành công. Fire-and-forget:
    // không chặn flow. Chỉ ghi cờ passwordReset — KHÔNG ghi giá trị mật khẩu.
    auditSetAccountPassword({
      actor: input.actor,
      targetUsername: input.username,
    });

    return { username: input.username };
  }

  /**
   * Enforce phân quyền đổi mật khẩu dựa trên role caller vs target.
   *
   * - Admin (super role) → đổi pass cho mọi tài khoản, bỏ qua check target.
   * - Staff → chỉ đổi pass cho tài khoản Staff; cấm đổi pass cho Admin.
   *
   * @throws notFound nếu target không tồn tại; forbidden nếu Staff đụng Admin.
   */
  private async assertCallerCanSetPassword(callerRoles: CompanyRole[], targetUsername: string): Promise<void> {
    if (callerRoles.includes(CompanyRole.Admin)) {
      return;
    }

    // Chỉ cần roles để quyết định → projection tối thiểu (luôn giữ _id cho mapper).
    const target = await this.accountRepo.getAccountByUsername(targetUsername, {
      projection: { roles: 1 },
    });

    if (!target) {
      throw AppException.notFound("Tài khoản không tồn tại");
    }

    // roles là union (Company/Agent/Player) → so khớp ở dạng string cho an toàn type.
    const targetRoles = target.roles as readonly string[];
    if (targetRoles.includes(CompanyRole.Admin)) {
      throw AppException.forbidden("Bạn không có quyền đổi mật khẩu cho tài khoản này.");
    }
  }
}

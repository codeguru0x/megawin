import { GetAuditLogUseCase } from "@megawin/audit/use-cases";
import { CompanyRole } from "@megawin/identity/entities";

import { withApi } from "@/lib/api";

const useCase = new GetAuditLogUseCase();

/**
 * `GET /api/me/audit-logs/{id}` — chi tiết 1 bản ghi nhật ký bảo mật của **chính user**.
 *
 * Self-scoped 2 chiều: truyền `requireSelfScope = session.user.accountId` xuống
 * use-case. Record chỉ trả khi thuộc nhóm action security VÀ user là actor hoặc
 * target (account.*); còn lại → 404 (không lộ existence). User không thể mở chi
 * tiết log người khác dù đoán đúng id. Session thiếu `accountId` → ép `""` → 404.
 */
export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async ({ params, session }) => {
    const { id } = params as { id: string };
    return useCase.run({ id, requireSelfScope: session!.user.accountId ?? "" });
  });

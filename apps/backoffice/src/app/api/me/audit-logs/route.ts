import { ListMyAuditLogsUseCase } from "@megawin/audit/use-cases";
import { CompanyRole } from "@megawin/identity/entities";

import { withApi } from "@/lib/api";

import { listMyAuditLogsQuerySchema } from "./_lib/schema";

const useCase = new ListMyAuditLogsUseCase();

/**
 * `GET /api/me/audit-logs` — nhật ký BẢO MẬT của **chính user đang đăng nhập**.
 *
 * Self-scoped 2 chiều: route ép `accountId = session.user.accountId` server-side.
 * {@link ListMyAuditLogsUseCase} chỉ trả record thuộc nhóm action security
 * (`SELF_ACTIVITY_ACTIONS` — auth/account) mà user là **actor** HOẶC là **target**
 * của account.* (bị reset pass / tắt MFA — tín hiệu chiếm quyền).
 *
 * Client KHÔNG truyền được `accountId` khác: schema {@link listMyAuditLogsQuerySchema}
 * không khai actor, và use-case input KHÔNG có field `actor/ip/game/…` (chặn ở tầng
 * type). Session thiếu `accountId` → ép `""` → repo trả rỗng (an toàn: không lộ log).
 */
export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(listMyAuditLogsQuerySchema)
  .handler(async ({ query, session }) => useCase.run({ ...query, accountId: session!.user.accountId ?? "" }));

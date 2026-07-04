import { withApi } from "@/lib/api";
import { actorFromSession } from "@/lib/audit-actor";
import { CompanyRole } from "@megawin/identity/entities";
import { TriggerResettleUseCase } from "@megawin/game-power655-application/use-cases/draws";
import { env } from "@/env";

import { triggerResettleSchema } from "../../_lib/schema";

const triggerResettleUseCase = new TriggerResettleUseCase();

/**
 * POST /api/power655/draws/[drawId]/resettle
 *
 * Khởi động phiên kết sổ lại (Resettle) Power 6/55.
 *
 * Yêu cầu:
 *   - Kỳ quay đã từng được kết sổ (`settledAt` != null).
 *   - Đã có kết quả mới thông qua publish-result (result.publishedAt > settledAt).
 *   - Staff đã xem kết quả pre-flight (`/resettle-preflight`) và xác nhận.
 *   - TYPE_B1 / TYPE_B2: body `dbaConfirmed: true` (đã báo Quản trị hệ thống chốt cycle).
 *
 * Trả về error nếu:
 *   - `DRAW_NEVER_SETTLED`: kỳ chưa từng settle.
 *   - `DRAW_NO_NEW_RESULT`: kết quả chưa thay đổi sau lần settle trước.
 *   - `LEDGER_MISSING`: kỳ settle trước khi có Cycle Ledger → DBA thủ công.
 *   - `RESETTLE_REQUIRES_DBA`: TYPE_B1 / TYPE_B2 thiếu `dbaConfirmed`.
 *   - `RESETTLE_CASCADE_ORDER`: TYPE_B2 — kỳ trước trong chain chưa resettle xong.
 *   - `RESETTLE_LOCK_HELD`: đang có phiên resettle khác đang chạy.
 */
export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(triggerResettleSchema)
  .handler(async ({ params, body, session, request }) => {
    const { drawId } = params as { drawId: string };
    return triggerResettleUseCase.run({
      drawId,
      RESETTLE_SFN_ARN: env.POWER655_RESETTLE_SFN_ARN,
      dbaConfirmed: body.dbaConfirmed,
      actor: actorFromSession(session!, request),
    });
  });

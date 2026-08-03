import { AckAlertUseCase } from "@megawin/game-max3d-application/use-cases/operations";
import { CompanyRole } from "@megawin/identity/entities";

import { withApi } from "@/lib/api";
import { actorFromSession } from "@/lib/audit-actor";

const useCase = new AckAlertUseCase();

/**
 * POST /api/max3d/operations/alerts/{id}/ack
 *
 * Staff acknowledge 1 alert (đã xem/xử lý). `actorId` lấy từ session để truy vết ai ack.
 * KHÔNG xoá alert — UI v6: item ack thu gọn dưới disclosure per-group (audit trail).
 */
export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async ({ params, session, request }) => {
    const { id } = params as { id: string };
    const actor = actorFromSession(session!, request);
    return useCase.run({ alertId: id, actorId: actor.id });
  });

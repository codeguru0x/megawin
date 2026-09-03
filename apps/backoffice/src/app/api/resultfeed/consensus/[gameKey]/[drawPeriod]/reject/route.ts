import { CompanyRole } from "@megawin/identity/entities";
import { RejectConsensusUseCase } from "@megawin/resultfeed-application/use-cases/consensus";

import { withApi } from "@/lib/api";
import { actorFromSession } from "@/lib/audit-actor";

import { consensusPeriodParamsSchema, rejectConsensusSchema } from "../../../../_lib/schema";

const rejectConsensusUseCase = new RejectConsensusUseCase();

/**
 * POST /api/resultfeed/consensus/[gameKey]/[drawPeriod]/reject
 *
 * Từ chối 1 kỳ — nguồn rút kết quả, kỳ bị huỷ, hoặc không thể xác định số đúng. Bắt buộc
 * `note` giải trình lý do.
 */
export const POST = withApi()
  .auth({ roles: [CompanyRole.Admin] })
  .params(consensusPeriodParamsSchema)
  .body(rejectConsensusSchema)
  .handler(async ({ params, body, session, request }) => {
    return rejectConsensusUseCase.run({
      gameKey: params.gameKey,
      drawPeriod: params.drawPeriod,
      note: body.note,
      actor: actorFromSession(session!, request),
    });
  });

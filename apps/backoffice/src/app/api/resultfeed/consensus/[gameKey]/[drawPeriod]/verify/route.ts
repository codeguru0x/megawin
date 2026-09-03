import { CompanyRole } from "@megawin/identity/entities";
import { VerifyConsensusUseCase } from "@megawin/resultfeed-application/use-cases/consensus";

import { withApi } from "@/lib/api";
import { actorFromSession } from "@/lib/audit-actor";

import { consensusPeriodParamsSchema, verifyConsensusSchema } from "../../../../_lib/schema";

const verifyConsensusUseCase = new VerifyConsensusUseCase();

/**
 * POST /api/resultfeed/consensus/[gameKey]/[drawPeriod]/verify
 *
 * Chốt kết quả 1 kỳ — chọn observation làm chuẩn, hoặc nhập tay (`chosenObservationId=null`).
 * Tự set `publishedAt` bên trong use-case — không có action publish riêng (auto-publish đã
 * chạy ở worker cho kỳ `Agreed`, action này chỉ dành cho kỳ `Conflict`/`Pending` cần người xác nhận).
 */
export const POST = withApi()
  .auth({ roles: [CompanyRole.Admin] })
  .params(consensusPeriodParamsSchema)
  .body(verifyConsensusSchema)
  .handler(async ({ params, body, session, request }) => {
    return verifyConsensusUseCase.run({
      gameKey: params.gameKey,
      drawPeriod: params.drawPeriod,
      ...body,
      actor: actorFromSession(session!, request),
    });
  });

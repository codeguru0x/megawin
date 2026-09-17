import { GetPlayerOutstandingUseCase } from "@megawin/game-core-application/use-cases/reports";
import { CompanyRole } from "@megawin/identity/entities";
import { z } from "zod";

import { withApi } from "@/lib/api";

const getPlayerOutstandingUseCase = new GetPlayerOutstandingUseCase();

/**
 * GET /api/accounts/players/[accountId]/outstanding
 *
 * Query on-demand entries đang chờ (scheduled) của 1 player — cross-game.
 * Không có query params — luôn trả tất cả outstanding entries hiện tại.
 */

const paramsSchema = z.object({
  accountId: z.string().min(1),
});
export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .params(paramsSchema)
  .handler(async ({ params }) => {
    const accountId = params.accountId;
    return getPlayerOutstandingUseCase.run({ accountId });
  });

import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { GetPlayerDrawBreakdownUseCase } from "@megawin/game-core-application/use-cases/reports";

import { playerDrawBreakdownQuerySchema } from "../_lib/schema";

const getPlayerDrawBreakdownUseCase = new GetPlayerDrawBreakdownUseCase();

/**
 * GET /api/accounts/players/[accountId]/draws?financialDate=YYYY-MM-DD&game={gameProduct}
 *
 * Trả breakdown theo kỳ quay (drawId) của player trong 1 ngày × 1 game.
 * View 3 trong Player Detail → Tài chính drill-down.
 */
export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(playerDrawBreakdownQuerySchema)
  .handler(async ({ query, params }) => {
    const accountId = (params as { accountId: string }).accountId;
    return getPlayerDrawBreakdownUseCase.run({
      accountId,
      financialDate: query.financialDate,
      game: query.game,
    });
  });

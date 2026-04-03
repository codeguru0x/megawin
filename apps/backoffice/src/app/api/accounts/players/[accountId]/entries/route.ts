import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { GetPlayerEntriesUseCase } from "@megawin/game-core-application/use-cases/reports";

import { playerEntriesQuerySchema } from "../_lib/schema";

const getPlayerEntriesUseCase = new GetPlayerEntriesUseCase();

/**
 * GET /api/accounts/players/[accountId]/entries?financialDate=YYYY-MM-DD&game={gameProduct}
 *
 * Trả danh sách entries settled/voided của player trong 1 ngày × 1 game.
 * Drill cấp 2 từ bảng tài chính Player Detail.
 * 1 player = 1 tenant — không cần tenantId param.
 */
export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(playerEntriesQuerySchema)
  .handler(async ({ query, params }) => {
    const accountId = (params as { accountId: string }).accountId;
    return getPlayerEntriesUseCase.run({
      accountId,
      financialDate: query.financialDate,
      game: query.game,
      drawId: query.drawId,
    });
  });

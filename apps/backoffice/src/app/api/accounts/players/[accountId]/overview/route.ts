import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { GetPlayerOverviewUseCase } from "@megawin/game-core-application/use-cases/reports";

import { playerOverviewQuerySchema } from "../_lib/schema";

const getPlayerOverviewUseCase = new GetPlayerOverviewUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(playerOverviewQuerySchema)
  .handler(async ({ query, params }) => {
    const accountId = (params as { accountId: string }).accountId;
    return getPlayerOverviewUseCase.run({
      accountId,
      from: query.from,
      to: query.to,
    });
  });

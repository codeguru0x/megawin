import { GetPlayerFinancialsUseCase } from "@megawin/game-core-application/use-cases/reports";
import { CompanyRole } from "@megawin/identity/entities";

import { withApi } from "@/lib/api";

import { playerFinancialsQuerySchema } from "../_lib/schema";

const getPlayerFinancialsUseCase = new GetPlayerFinancialsUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(playerFinancialsQuerySchema)
  .handler(async ({ query, params }) => {
    const accountId = (params as { accountId: string }).accountId;
    return getPlayerFinancialsUseCase.run({
      accountId,
      from: query.from,
      to: query.to,
      game: query.game,
    });
  });

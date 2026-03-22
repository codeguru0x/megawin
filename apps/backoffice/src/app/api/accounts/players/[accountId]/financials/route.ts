import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities/account";
import { GetPlayerFinancialsUseCase } from "@megawin/game-core-application/use-cases/reports";

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

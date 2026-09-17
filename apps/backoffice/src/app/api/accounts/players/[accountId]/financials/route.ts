import { GetPlayerFinancialsUseCase } from "@megawin/game-core-application/use-cases/reports";
import { CompanyRole } from "@megawin/identity/entities";
import { z } from "zod";

import { withApi } from "@/lib/api";

import { playerFinancialsQuerySchema } from "../_lib/schema";

const getPlayerFinancialsUseCase = new GetPlayerFinancialsUseCase();

const paramsSchema = z.object({
  accountId: z.string().min(1),
});
export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(playerFinancialsQuerySchema)
  .params(paramsSchema)
  .handler(async ({ query, params }) => {
    const accountId = params.accountId;
    return getPlayerFinancialsUseCase.run({
      accountId,
      from: query.from,
      to: query.to,
      game: query.game,
    });
  });

import { GetPlayerOverviewUseCase } from "@megawin/game-core-application/use-cases/reports";
import { CompanyRole } from "@megawin/identity/entities";
import { z } from "zod";

import { withApi } from "@/lib/api";

import { playerOverviewQuerySchema } from "../_lib/schema";

const getPlayerOverviewUseCase = new GetPlayerOverviewUseCase();

const paramsSchema = z.object({
  accountId: z.string().min(1),
});
export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(playerOverviewQuerySchema)
  .params(paramsSchema)
  .handler(async ({ query, params }) => {
    const accountId = params.accountId;
    return getPlayerOverviewUseCase.run({
      accountId,
      from: query.from,
      to: query.to,
    });
  });

import { GetTopCombosUseCase } from "@megawin/game-keno-application/use-cases/operations";
import { CompanyRole } from "@megawin/identity/entities";

import { withApi } from "@/lib/api";

import { topCombosQuerySchema } from "../_lib/schema";

const useCase = new GetTopCombosUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(topCombosQuerySchema)
  .handler(async ({ query }) => {
    return useCase.run({
      drawId: query.drawId,
      limit: query.limit,
    });
  });

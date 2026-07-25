import { GetWinningEntriesUseCase } from "@megawin/game-bingo18-application/use-cases/operations";
import { CompanyRole } from "@megawin/identity/entities";

import { withApi } from "@/lib/api";

import { winningEntriesQuerySchema } from "../_lib/schema";

const useCase = new GetWinningEntriesUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(winningEntriesQuerySchema)
  .handler(async ({ query }) => {
    return useCase.run({
      drawId: query.drawId,
      cursor: query.cursor,
      limit: query.limit,
    });
  });

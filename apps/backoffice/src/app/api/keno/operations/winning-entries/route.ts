import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { GetWinningEntriesUseCase } from "@megawin/game-keno-application/use-cases/operations";
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

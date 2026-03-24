import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { GetTopCombosUseCase } from "@megawin/game-bingo18-application/use-cases/operations";
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

import { GetLiveEntriesUseCase } from "@megawin/game-bingo18-application/use-cases/operations";
import { CompanyRole } from "@megawin/identity/entities";

import { withApi } from "@/lib/api";

import { liveEntriesQuerySchema } from "../_lib/schema";

const useCase = new GetLiveEntriesUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(liveEntriesQuerySchema)
  .handler(async ({ query }) => {
    return useCase.run({
      drawId: query.drawId,
      limit: query.limit,
    });
  });

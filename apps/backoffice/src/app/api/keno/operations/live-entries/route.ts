import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { GetLiveEntriesUseCase } from "@megawin/game-keno-application/use-cases/operations";
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

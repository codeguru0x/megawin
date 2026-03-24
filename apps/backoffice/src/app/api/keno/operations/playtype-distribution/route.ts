import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { GetPlayTypeDistributionUseCase } from "@megawin/game-keno-application/use-cases/operations";
import { opsQuerySchema } from "../_lib/schema";

const useCase = new GetPlayTypeDistributionUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(opsQuerySchema)
  .handler(async ({ query }) => {
    return useCase.run({
      financialDate: query.financialDate,
      drawId: query.drawId,
    });
  });

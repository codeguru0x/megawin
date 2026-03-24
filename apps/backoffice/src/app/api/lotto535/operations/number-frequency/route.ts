import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { GetNumberFrequencyUseCase } from "@megawin/game-lotto535-application/use-cases/operations";
import { opsQuerySchema } from "../_lib/schema";

const useCase = new GetNumberFrequencyUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(opsQuerySchema)
  .handler(async ({ query }) => {
    return useCase.run({
      financialDate: query.financialDate,
      drawId: query.drawId,
    });
  });

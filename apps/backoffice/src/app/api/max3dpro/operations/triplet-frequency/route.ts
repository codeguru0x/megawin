import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { GetTripletFrequencyUseCase } from "@megawin/game-max3dpro-application/use-cases/operations";
import { tripletFrequencyQuerySchema } from "../_lib/schema";

const useCase = new GetTripletFrequencyUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(tripletFrequencyQuerySchema)
  .handler(async ({ query }) => {
    return useCase.run({
      financialDate: query.financialDate,
      drawId: query.drawId,
      limit: query.limit,
    });
  });

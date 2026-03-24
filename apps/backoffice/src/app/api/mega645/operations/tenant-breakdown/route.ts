import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { GetTenantBreakdownUseCase } from "@megawin/game-mega645-application/use-cases/operations";
import { opsQuerySchema } from "../_lib/schema";

const useCase = new GetTenantBreakdownUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(opsQuerySchema)
  .handler(async ({ query }) => {
    return useCase.run({
      financialDate: query.financialDate,
      drawId: query.drawId,
    });
  });

import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { ListOutstandingTenantPlayersUseCase } from "@megawin/game-power655-application/use-cases/reports";

const useCase = new ListOutstandingTenantPlayersUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async ({ params }) => {
    const { drawId, tenantId } = (await params) as { drawId: string; tenantId: string };
    return useCase.run({ drawId, tenantId });
  });

import { ListOutstandingTenantPlayersUseCase } from "@megawin/game-max3d-application/use-cases/reports";
import { CompanyRole } from "@megawin/identity/entities";

import { withApi } from "@/lib/api";

const useCase = new ListOutstandingTenantPlayersUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async ({ params }) => {
    const { drawId, tenantId } = (await params) as { drawId: string; tenantId: string };
    return useCase.run({ drawId, tenantId });
  });

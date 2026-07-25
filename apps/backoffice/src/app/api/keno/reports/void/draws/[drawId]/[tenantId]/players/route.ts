import { ListVoidTenantPlayersUseCase } from "@megawin/game-keno-application/use-cases/reports";
import { CompanyRole } from "@megawin/identity/entities";

import { withApi } from "@/lib/api";

const useCase = new ListVoidTenantPlayersUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async ({ params }) => {
    const { drawId, tenantId } = await params;
    return useCase.run({ drawId: drawId as string, tenantId: tenantId as string });
  });

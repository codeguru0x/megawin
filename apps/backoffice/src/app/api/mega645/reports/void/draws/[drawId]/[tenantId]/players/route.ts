import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { ListVoidTenantPlayersUseCase } from "@megawin/game-mega645-application/use-cases/reports";

const useCase = new ListVoidTenantPlayersUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async ({ params }) => {
    const { drawId, tenantId } = await params;
    return useCase.run({ drawId: drawId as string, tenantId: tenantId as string });
  });

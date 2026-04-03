import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { ListVoidPlayerEntriesUseCase } from "@megawin/game-max3d-application/use-cases/reports";

const useCase = new ListVoidPlayerEntriesUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async ({ params }) => {
    const { drawId, tenantId, accountId } = await params;
    return useCase.run({
      drawId: drawId as string,
      tenantId: tenantId as string,
      accountId: accountId as string,
    });
  });

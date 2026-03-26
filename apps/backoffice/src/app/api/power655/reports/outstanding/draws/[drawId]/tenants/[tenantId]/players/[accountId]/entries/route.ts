import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { ListOutstandingPlayerEntriesUseCase } from "@megawin/game-power655-application/use-cases/reports";

const useCase = new ListOutstandingPlayerEntriesUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async ({ params }) => {
    const { drawId, tenantId, accountId } = (await params) as {
      drawId: string;
      tenantId: string;
      accountId: string;
    };
    return useCase.run({ drawId, tenantId, accountId });
  });

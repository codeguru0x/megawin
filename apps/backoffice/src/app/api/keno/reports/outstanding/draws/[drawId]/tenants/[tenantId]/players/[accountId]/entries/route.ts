import { ListOutstandingPlayerEntriesUseCase } from "@megawin/game-keno-application/use-cases/reports";
import { CompanyRole } from "@megawin/identity/entities";

import { withApi } from "@/lib/api";

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

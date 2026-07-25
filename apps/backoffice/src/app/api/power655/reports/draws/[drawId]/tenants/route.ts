import { ListDrawTenantsUseCase } from "@megawin/game-power655-application/use-cases/reports";
import { CompanyRole } from "@megawin/identity/entities";

import { withApi } from "@/lib/api";

const useCase = new ListDrawTenantsUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async ({ params }) => {
    const drawId = (await params).drawId as string;
    return useCase.run({ drawId });
  });

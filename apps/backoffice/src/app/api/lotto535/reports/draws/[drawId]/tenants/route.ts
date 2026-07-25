import { ListDrawTenantsUseCase } from "@megawin/game-lotto535-application/use-cases/reports";
import { CompanyRole } from "@megawin/identity/entities";

import { withApi } from "@/lib/api";

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async ({ params }) => {
    const drawId = (await params).drawId as string;
    return new ListDrawTenantsUseCase().run({ drawId });
  });

import { ListVoidDrawTenantsUseCase } from "@megawin/game-max3d-application/use-cases/reports";
import { CompanyRole } from "@megawin/identity/entities";

import { withApi } from "@/lib/api";

const useCase = new ListVoidDrawTenantsUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async ({ params }) => {
    const drawId = (await params).drawId as string;
    return useCase.run({ drawId });
  });

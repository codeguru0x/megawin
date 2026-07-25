import { GetDrawDetailUseCase } from "@megawin/game-mega645-application/use-cases/draws";
import { CompanyRole } from "@megawin/identity/entities";

import { withApi } from "@/lib/api";

const getDrawDetailUseCase = new GetDrawDetailUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async ({ params }) => {
    const { drawId } = params as { drawId: string };
    return getDrawDetailUseCase.run({ drawId });
  });

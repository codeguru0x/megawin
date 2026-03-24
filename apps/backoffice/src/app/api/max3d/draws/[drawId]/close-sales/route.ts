import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { CloseSalesUseCase } from "@megawin/game-max3d-application/use-cases/draws";

const closeSalesUseCase = new CloseSalesUseCase();

export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async ({ params }) => {
    const { drawId } = params as { drawId: string };
    return closeSalesUseCase.run({ drawId });
  });

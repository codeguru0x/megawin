import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities/account";
import { OpenSalesUseCase } from "@megawin/game-max3d-application/use-cases/draws";

const openSalesUseCase = new OpenSalesUseCase();

export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async ({ params }) => {
    const { drawId } = params as { drawId: string };
    return openSalesUseCase.run({ drawId });
  });

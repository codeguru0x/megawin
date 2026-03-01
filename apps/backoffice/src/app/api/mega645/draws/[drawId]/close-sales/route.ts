import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities/account";
import { CloseSalesUseCase } from "@megawin/game-mega645-application/use-cases/draws";

const closeSalesUseCase = new CloseSalesUseCase();

export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async ({ params }) => {
    const { drawId } = params as { drawId: string };
    return closeSalesUseCase.run({ drawId });
  });

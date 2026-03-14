import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities/account";
import { ListDrawTenantsUseCase } from "@megawin/game-mega645-application/use-cases/reports";

const useCase = new ListDrawTenantsUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async ({ params }) => {
    const drawId = (await params).drawId as string;
    return useCase.run({ drawId });
  });

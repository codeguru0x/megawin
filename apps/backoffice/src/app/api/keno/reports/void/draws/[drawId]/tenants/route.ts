import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { ListVoidDrawTenantsUseCase } from "@megawin/game-keno-application/use-cases/reports";

const useCase = new ListVoidDrawTenantsUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async ({ params }) => {
    const drawId = (await params).drawId as string;
    return useCase.run({ drawId });
  });

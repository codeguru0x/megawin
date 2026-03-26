import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { ListOutstandingDrawTenantsUseCase } from "@megawin/game-lotto535-application/use-cases/reports";

const useCase = new ListOutstandingDrawTenantsUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async ({ params }) => {
    const drawId = (await params).drawId as string;
    return useCase.run({ drawId });
  });

import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities/account";
import { ListDrawTenantsUseCase } from "@megawin/game-lotto535-application/use-cases/reports";

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async ({ params }) => {
    const drawId = (await params).drawId as string;
    return new ListDrawTenantsUseCase().run({ drawId });
  });

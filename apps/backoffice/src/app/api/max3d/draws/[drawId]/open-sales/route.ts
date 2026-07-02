import { withApi } from "@/lib/api";
import { actorFromSession } from "@/lib/audit-actor";
import { CompanyRole } from "@megawin/identity/entities";
import { OpenSalesUseCase } from "@megawin/game-max3d-application/use-cases/draws";

const openSalesUseCase = new OpenSalesUseCase();

export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async ({ params, session }) => {
    const { drawId } = params as { drawId: string };
    return openSalesUseCase.run({ drawId, actor: actorFromSession(session!) });
  });

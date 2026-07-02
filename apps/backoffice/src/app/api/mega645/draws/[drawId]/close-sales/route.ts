import { withApi } from "@/lib/api";
import { actorFromSession } from "@/lib/audit-actor";
import { CompanyRole } from "@megawin/identity/entities";
import { CloseSalesUseCase } from "@megawin/game-mega645-application/use-cases/draws";

const closeSalesUseCase = new CloseSalesUseCase();

export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async ({ params, session }) => {
    const { drawId } = params as { drawId: string };
    return closeSalesUseCase.run({ drawId, actor: actorFromSession(session!) });
  });

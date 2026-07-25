import { CloseSalesUseCase } from "@megawin/game-mega645-application/use-cases/draws";
import { CompanyRole } from "@megawin/identity/entities";

import { withApi } from "@/lib/api";
import { actorFromSession } from "@/lib/audit-actor";

const closeSalesUseCase = new CloseSalesUseCase();

export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async ({ params, session, request }) => {
    const { drawId } = params as { drawId: string };
    return closeSalesUseCase.run({ drawId, actor: actorFromSession(session!, request) });
  });

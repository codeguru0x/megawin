import { CloseSalesUseCase } from "@megawin/game-max3dpro-application/use-cases/draws";
import { CompanyRole } from "@megawin/identity/entities";
import { z } from "zod";

import { withApi } from "@/lib/api";
import { actorFromSession } from "@/lib/audit-actor";

const closeSalesUseCase = new CloseSalesUseCase();

const paramsSchema = z.object({
  drawId: z.string().min(1),
});
export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .params(paramsSchema)
  .handler(async ({ params, session, request }) => {
    const { drawId } = params;
    return closeSalesUseCase.run({ drawId, actor: actorFromSession(session!, request) });
  });

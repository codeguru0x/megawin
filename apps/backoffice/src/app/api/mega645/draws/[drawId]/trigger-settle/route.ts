import { TriggerSettleUseCase } from "@megawin/game-mega645-application/use-cases/draws";
import { CompanyRole } from "@megawin/identity/entities";
import { z } from "zod";

import { env } from "@/env";
import { withApi } from "@/lib/api";
import { actorFromSession } from "@/lib/audit-actor";

const triggerSettleUseCase = new TriggerSettleUseCase();

const paramsSchema = z.object({
  drawId: z.string().min(1),
});
export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .params(paramsSchema)
  .handler(async ({ params, session, request }) => {
    const { drawId } = params;
    return triggerSettleUseCase.run({
      drawId,
      SETTLE_SFN_ARN: env.MEGA645_SETTLE_SFN_ARN!,
      actor: actorFromSession(session!, request),
    });
  });

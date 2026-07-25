import { VoidDrawUseCase } from "@megawin/game-lotto535-application/use-cases/draws";
import { CompanyRole } from "@megawin/identity/entities";
import { z } from "zod";

import { env } from "@/env";
import { withApi } from "@/lib/api";
import { actorFromSession } from "@/lib/audit-actor";

const voidSchema = z.object({
  reason: z.string().min(1, "Lý do huỷ không được để trống."),
});

const voidDrawUseCase = new VoidDrawUseCase();

export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(voidSchema)
  .handler(async ({ params, body, session, request }) => {
    const { drawId } = params as { drawId: string };
    return voidDrawUseCase.run({
      drawId,
      reason: body.reason,
      actor: actorFromSession(session!, request),
      LOTTO535_VOID_SFN_ARN: env.LOTTO535_VOID_SFN_ARN!,
    });
  });

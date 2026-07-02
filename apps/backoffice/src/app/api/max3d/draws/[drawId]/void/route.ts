import { z } from "zod";

import { withApi } from "@/lib/api";
import { actorFromSession } from "@/lib/audit-actor";
import { CompanyRole } from "@megawin/identity/entities";
import { VoidDrawUseCase } from "@megawin/game-max3d-application/use-cases/draws";

const voidSchema = z.object({
  reason: z.string().min(1, "Lý do huỷ không được để trống."),
});

const voidDrawUseCase = new VoidDrawUseCase();

export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(voidSchema)
  .handler(async ({ params, body, session }) => {
    const { drawId } = params as { drawId: string };
    return voidDrawUseCase.run({
      drawId,
      reason: body.reason,
      actor: actorFromSession(session!),
    });
  });

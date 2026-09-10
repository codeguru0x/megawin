import { VoidDrawUseCase } from "@megawin/game-bingo18-application/use-cases/draws";
import { CompanyRole } from "@megawin/identity/entities";
import { z } from "zod";

import { withApi } from "@/lib/api";
import { actorFromSession } from "@/lib/audit-actor";

import { invalidateHubSnapshotCache } from "../../../operations/hub-snapshot/_lib/snapshot-cache";

const voidSchema = z.object({
  reason: z.string().min(1, "Lý do huỷ không được để trống."),
});

const voidDrawUseCase = new VoidDrawUseCase();

export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(voidSchema)
  .handler(async ({ params, body, session, request }) => {
    const { drawId } = params as { drawId: string };
    const result = await voidDrawUseCase.run({
      drawId,
      reason: body.reason,
      actor: actorFromSession(session!, request),
    });
    invalidateHubSnapshotCache();
    return result;
  });

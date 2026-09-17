import { PublishResultUseCase } from "@megawin/game-keno-application/use-cases/draws";
import { CompanyRole } from "@megawin/identity/entities";
import { z } from "zod";

import { withApi } from "@/lib/api";
import { actorFromSession } from "@/lib/audit-actor";

import { publishResultSchema } from "../_lib/schema";
import { invalidateHubSnapshotCache } from "../../../operations/hub-snapshot/_lib/snapshot-cache";

const publishResultUseCase = new PublishResultUseCase();

const paramsSchema = z.object({
  drawId: z.string().min(1),
});
export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(publishResultSchema)
  .params(paramsSchema)
  .handler(async ({ params, body, session, request }) => {
    const { drawId } = params;
    const result = await publishResultUseCase.run({
      drawId,
      ...body,
      actor: actorFromSession(session!, request),
    });
    invalidateHubSnapshotCache();
    return result;
  });

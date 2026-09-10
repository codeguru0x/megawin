import { PublishResultUseCase } from "@megawin/game-keno-application/use-cases/draws";
import { CompanyRole } from "@megawin/identity/entities";

import { withApi } from "@/lib/api";
import { actorFromSession } from "@/lib/audit-actor";

import { invalidateHubSnapshotCache } from "../../../operations/hub-snapshot/_lib/snapshot-cache";
import { publishResultSchema } from "../_lib/schema";

const publishResultUseCase = new PublishResultUseCase();

export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(publishResultSchema)
  .handler(async ({ params, body, session, request }) => {
    const { drawId } = params as { drawId: string };
    const result = await publishResultUseCase.run({
      drawId,
      ...body,
      actor: actorFromSession(session!, request),
    });
    invalidateHubSnapshotCache();
    return result;
  });

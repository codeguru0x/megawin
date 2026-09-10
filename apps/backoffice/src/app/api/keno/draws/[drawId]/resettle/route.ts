import { TriggerResettleUseCase } from "@megawin/game-keno-application/use-cases/draws";
import { CompanyRole } from "@megawin/identity/entities";

import { env } from "@/env";
import { withApi } from "@/lib/api";
import { actorFromSession } from "@/lib/audit-actor";

import { invalidateHubSnapshotCache } from "../../../operations/hub-snapshot/_lib/snapshot-cache";

const triggerResettleUseCase = new TriggerResettleUseCase();

export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async ({ params, session, request }) => {
    const { drawId } = params as { drawId: string };
    const result = await triggerResettleUseCase.run({
      drawId,
      RESETTLE_SFN_ARN: env.KENO_RESETTLE_SFN_ARN!,
      actor: actorFromSession(session!, request),
    });
    invalidateHubSnapshotCache();
    return result;
  });

import { TriggerSettleUseCase } from "@megawin/game-bingo18-application/use-cases/draws";
import { CompanyRole } from "@megawin/identity/entities";

import { env } from "@/env";
import { withApi } from "@/lib/api";
import { actorFromSession } from "@/lib/audit-actor";

import { invalidateHubSnapshotCache } from "../../../operations/hub-snapshot/_lib/snapshot-cache";

const triggerSettleUseCase = new TriggerSettleUseCase();

export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async ({ params, session, request }) => {
    const { drawId } = params as { drawId: string };
    const result = await triggerSettleUseCase.run({
      drawId,
      SETTLE_SFN_ARN: env.BINGO18_SETTLE_SFN_ARN!,
      actor: actorFromSession(session!, request),
    });
    invalidateHubSnapshotCache();
    return result;
  });

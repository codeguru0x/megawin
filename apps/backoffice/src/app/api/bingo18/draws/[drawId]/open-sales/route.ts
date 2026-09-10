import { OpenSalesUseCase } from "@megawin/game-bingo18-application/use-cases/draws";
import { CompanyRole } from "@megawin/identity/entities";

import { withApi } from "@/lib/api";
import { actorFromSession } from "@/lib/audit-actor";

import { invalidateHubSnapshotCache } from "../../../operations/hub-snapshot/_lib/snapshot-cache";

const openSalesUseCase = new OpenSalesUseCase();

export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async ({ params, session, request }) => {
    const { drawId } = params as { drawId: string };
    const result = await openSalesUseCase.run({ drawId, actor: actorFromSession(session!, request) });
    invalidateHubSnapshotCache();
    return result;
  });

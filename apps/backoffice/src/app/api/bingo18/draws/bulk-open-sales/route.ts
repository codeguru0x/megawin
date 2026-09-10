import { BulkOpenSalesUseCase } from "@megawin/game-bingo18-application/use-cases/draws";
import { CompanyRole } from "@megawin/identity/entities";

import { withApi } from "@/lib/api";
import { actorFromSession } from "@/lib/audit-actor";

import { invalidateHubSnapshotCache } from "../../operations/hub-snapshot/_lib/snapshot-cache";
import { bulkDrawIdsSchema } from "../_lib/schema";

const bulkOpenSalesUseCase = new BulkOpenSalesUseCase();

/**
 * Mở bán hàng loạt (Ops Hub Bingo18) — cùng quyền với
 * `POST /api/bingo18/draws/[drawId]/open-sales`. Kỳ đã quá `sales.closeAt` trả
 * `DRAW_SALES_WINDOW_CLOSED`.
 */
export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(bulkDrawIdsSchema)
  .handler(async ({ body, session, request }) => {
    const result = await bulkOpenSalesUseCase.run({
      drawIds: body.drawIds,
      actor: actorFromSession(session!, request),
    });
    invalidateHubSnapshotCache();
    return result;
  });

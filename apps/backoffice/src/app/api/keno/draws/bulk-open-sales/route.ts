import { BulkOpenSalesUseCase } from "@megawin/game-keno-application/use-cases/draws";
import { CompanyRole } from "@megawin/identity/entities";

import { withApi } from "@/lib/api";
import { actorFromSession } from "@/lib/audit-actor";

import { invalidateHubSnapshotCache } from "../../operations/hub-snapshot/_lib/snapshot-cache";
import { bulkDrawIdsSchema } from "../_lib/schema";

const bulkOpenSalesUseCase = new BulkOpenSalesUseCase();

/**
 * Mở bán hàng loạt (Ops Hub) — cùng quyền với `POST /api/keno/draws/[drawId]/open-sales`.
 * Kỳ đã quá `sales.closeAt` trả `DRAW_SALES_WINDOW_CLOSED`, KHÔNG "thành công vô dụng"
 * (xem `bulk-open-sales.ts` JSDoc).
 */
export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(bulkDrawIdsSchema)
  .handler(async ({ body, session, request }) => {
    const result = await bulkOpenSalesUseCase.run({
      drawIds: body.drawIds,
      actor: actorFromSession(session!, request),
    });
    // Xoá cache snapshot Hub NGAY sau khi DB write commit (xem JSDoc `invalidateHubSnapshotCache`).
    invalidateHubSnapshotCache();
    return result;
  });

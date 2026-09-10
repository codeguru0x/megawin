import { BulkVoidDrawUseCase } from "@megawin/game-keno-application/use-cases/draws";
import { CompanyRole } from "@megawin/identity/entities";

import { env } from "@/env";
import { withApi } from "@/lib/api";
import { actorFromSession } from "@/lib/audit-actor";

import { invalidateHubSnapshotCache } from "../../operations/hub-snapshot/_lib/snapshot-cache";
import { bulkVoidSchema } from "../_lib/schema";

const bulkVoidDrawUseCase = new BulkVoidDrawUseCase();

/**
 * Huỷ kỳ hàng loạt (Ops Hub) — cùng quyền với `POST /api/keno/draws/[drawId]/void`. MỘT
 * `reason` áp cho cả lô. Kỳ ở `salesOpen` (chưa đóng bán) sẽ trả `DRAW_INVALID_TRANSITION`
 * cho đúng kỳ đó — FE phải chặn trước bằng `isVoidable` (xem `bulk-draw-action/limits.ts` JSDoc).
 */
export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(bulkVoidSchema)
  .handler(async ({ body, session, request }) => {
    const result = await bulkVoidDrawUseCase.run({
      drawIds: body.drawIds,
      reason: body.reason,
      actor: actorFromSession(session!, request),
      KENO_VOID_SFN_ARN: env.KENO_VOID_SFN_ARN!,
    });
    // Xoá cache snapshot Hub NGAY sau khi DB write commit (xem JSDoc `invalidateHubSnapshotCache`).
    invalidateHubSnapshotCache();
    return result;
  });

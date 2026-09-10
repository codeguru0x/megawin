import { BulkTriggerSettleUseCase } from "@megawin/game-keno-application/use-cases/draws";
import { CompanyRole } from "@megawin/identity/entities";

import { env } from "@/env";
import { withApi } from "@/lib/api";
import { actorFromSession } from "@/lib/audit-actor";

import { invalidateHubSnapshotCache } from "../../operations/hub-snapshot/_lib/snapshot-cache";
import { bulkDrawIdsSchema } from "../_lib/schema";

const bulkTriggerSettleUseCase = new BulkTriggerSettleUseCase();

/**
 * Kết sổ hàng loạt (Ops Hub) — cùng quyền với `POST /api/keno/draws/[drawId]/trigger-settle`.
 * Luôn `200`, kể cả khi vài/toàn bộ kỳ lỗi — FE đọc `results` để tô từng dòng.
 */
export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(bulkDrawIdsSchema)
  .handler(async ({ body, session, request }) => {
    const result = await bulkTriggerSettleUseCase.run({
      drawIds: body.drawIds,
      SETTLE_SFN_ARN: env.KENO_SETTLE_SFN_ARN!,
      actor: actorFromSession(session!, request),
    });
    // Xoá cache snapshot Hub NGAY sau khi DB write commit (xem JSDoc `invalidateHubSnapshotCache`).
    invalidateHubSnapshotCache();
    return result;
  });

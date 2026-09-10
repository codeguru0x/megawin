import { BulkCloseSalesUseCase } from "@megawin/game-keno-application/use-cases/draws";
import { CompanyRole } from "@megawin/identity/entities";

import { withApi } from "@/lib/api";
import { actorFromSession } from "@/lib/audit-actor";

import { invalidateHubSnapshotCache } from "../../operations/hub-snapshot/_lib/snapshot-cache";
import { bulkDrawIdsSchema } from "../_lib/schema";

const bulkCloseSalesUseCase = new BulkCloseSalesUseCase();

/**
 * Đóng bán hàng loạt (Ops Hub) — cùng quyền với `POST /api/keno/draws/[drawId]/close-sales`.
 * Action dùng nhiều nhất của Hub: mỗi batch chốt sổ theo giờ chạm hàng chục kỳ ở
 * chặng `PendingClose`.
 */
export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(bulkDrawIdsSchema)
  .handler(async ({ body, session, request }) => {
    const result = await bulkCloseSalesUseCase.run({
      drawIds: body.drawIds,
      actor: actorFromSession(session!, request),
    });
    // Xoá cache snapshot Hub NGAY sau khi DB write commit — bug thật đã đo 09/09 (xem JSDoc
    // `invalidateHubSnapshotCache`): refetch của client sau bulk action có thể trúng cửa sổ
    // TTL 2s và nhận lại data CŨ nếu không xoá tường minh ở đây.
    invalidateHubSnapshotCache();
    return result;
  });

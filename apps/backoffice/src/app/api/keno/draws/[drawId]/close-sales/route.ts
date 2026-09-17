import { CloseSalesUseCase } from "@megawin/game-keno-application/use-cases/draws";
import { CompanyRole } from "@megawin/identity/entities";
import { z } from "zod";

import { withApi } from "@/lib/api";
import { actorFromSession } from "@/lib/audit-actor";

import { invalidateHubSnapshotCache } from "../../../operations/hub-snapshot/_lib/snapshot-cache";

const closeSalesUseCase = new CloseSalesUseCase();

const paramsSchema = z.object({
  drawId: z.string().min(1),
});
export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .params(paramsSchema)
  .handler(async ({ params, session, request }) => {
    const { drawId } = params;
    const result = await closeSalesUseCase.run({ drawId, actor: actorFromSession(session!, request) });
    // Xoá cache snapshot Hub NGAY sau khi DB write commit — kỳ này cũng hiển thị trên Ops Hub
    // (xem JSDoc `invalidateHubSnapshotCache`), dù action gọi từ trang `operations/` đơn kỳ.
    invalidateHubSnapshotCache();
    return result;
  });

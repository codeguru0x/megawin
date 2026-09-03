import { CompanyRole } from "@megawin/identity/entities";
import { ListObservationsUseCase } from "@megawin/resultfeed-application/use-cases/observations";

import { withApi } from "@/lib/api";

import { listObservationsQuerySchema } from "../_lib/schema";

const listObservationsUseCase = new ListObservationsUseCase();

/**
 * GET /api/resultfeed/observations?gameKey=&limit=
 *
 * Observation gần đây theo game — dùng cho card debug/kiểm tra nhanh trên dashboard, khác
 * `GET /consensus/[gameKey]/[drawPeriod]` (đã kèm observations của đúng 1 kỳ cụ thể).
 */
export const GET = withApi()
  .auth({ roles: [CompanyRole.Admin] })
  .query(listObservationsQuerySchema)
  .handler(async ({ query }) => {
    return listObservationsUseCase.run(query);
  });

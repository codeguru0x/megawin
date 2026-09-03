import { CompanyRole } from "@megawin/identity/entities";
import { GetConsensusPeriodUseCase } from "@megawin/resultfeed-application/use-cases/consensus";

import { withApi } from "@/lib/api";

import { consensusPeriodParamsSchema } from "../../../_lib/schema";

const getConsensusPeriodUseCase = new GetConsensusPeriodUseCase();

/**
 * GET /api/resultfeed/consensus/[gameKey]/[drawPeriod]
 *
 * Chi tiết 1 kỳ — dùng cho card trong `review` (Conflict cần verify/reject) và trang `periods`
 * (tra cứu view-only). Trả cả `consensus` doc và toàn bộ `observations` để diff từng số.
 */
export const GET = withApi()
  .auth({ roles: [CompanyRole.Admin] })
  .params(consensusPeriodParamsSchema)
  .handler(async ({ params }) => {
    return getConsensusPeriodUseCase.run(params);
  });

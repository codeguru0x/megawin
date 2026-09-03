import { GetVietlottResultUseCase } from "@megawin/game-max3d-application/use-cases/draws";
import { CompanyRole } from "@megawin/identity/entities";
import { z } from "zod";

import { withApi } from "@/lib/api";
import { resultFeedClient } from "@/lib/resultfeed-client";

const getVietlottResultUseCase = new GetVietlottResultUseCase(resultFeedClient);

/**
 * GET /api/max3d/draws/[drawId]/vietlott-result
 *
 * Tự lấy kết quả Vietlott đã publish (ResultFeed) để điền form nhập/sửa kết quả kỳ Max 3D.
 * `drawId` trong path KHÔNG dùng trong use-case (chỉ cần `drawPeriod` từ query) — giữ trong
 * path để đồng bộ REST convention với `vietlott-suggestion`.
 */
export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(z.object({ drawPeriod: z.string().min(1) }))
  .handler(async ({ query }) => getVietlottResultUseCase.run({ drawPeriod: query.drawPeriod }));

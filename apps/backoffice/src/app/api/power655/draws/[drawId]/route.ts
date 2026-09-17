import { GetDrawDetailUseCase } from "@megawin/game-power655-application/use-cases/draws";
import { CompanyRole } from "@megawin/identity/entities";
import { z } from "zod";

import { withApi } from "@/lib/api";

const getDrawDetailUseCase = new GetDrawDetailUseCase();

/**
 * GET /api/power655/draws/[drawId]
 *
 * Lấy chi tiết kỳ quay Power 6/55 theo drawId.
 * Dùng cho operations dashboard (DrawCommandCenter, ResultSection, VoidInfo).
 */

const paramsSchema = z.object({
  drawId: z.string().min(1),
});
export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .params(paramsSchema)
  .handler(async ({ params }) => {
    const { drawId } = params;
    return getDrawDetailUseCase.run({ drawId });
  });

import { GetDrawDetailUseCase } from "@megawin/game-bingo18-application/use-cases/draws";
import { CompanyRole } from "@megawin/identity/entities";
import { z } from "zod";

import { withApi } from "@/lib/api";

const getDrawDetailUseCase = new GetDrawDetailUseCase();

/**
 * GET /api/bingo18/draws/[drawId]
 *
 * Lấy chi tiết kỳ quay Bingo 18 theo drawId.
 * Dùng cho operations dashboard (DrawCommandCenter, ResultSection).
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

import { GetDrawDetailUseCase } from "@megawin/game-bingo18-application/use-cases/draws";
import { CompanyRole } from "@megawin/identity/entities";

import { withApi } from "@/lib/api";

const getDrawDetailUseCase = new GetDrawDetailUseCase();

/**
 * GET /api/bingo18/draws/[drawId]
 *
 * Lấy chi tiết kỳ quay Bingo 18 theo drawId.
 * Dùng cho operations dashboard (DrawCommandCenter, ResultSection).
 */
export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async ({ params }) => {
    const { drawId } = params as { drawId: string };
    return getDrawDetailUseCase.run({ drawId });
  });

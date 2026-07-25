import { GetDrawDetailUseCase } from "@megawin/game-power655-application/use-cases/draws";
import { CompanyRole } from "@megawin/identity/entities";

import { withApi } from "@/lib/api";

const getDrawDetailUseCase = new GetDrawDetailUseCase();

/**
 * GET /api/power655/draws/[drawId]
 *
 * Lấy chi tiết kỳ quay Power 6/55 theo drawId.
 * Dùng cho operations dashboard (DrawCommandCenter, ResultSection, VoidInfo).
 */
export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async ({ params }) => {
    const { drawId } = params as { drawId: string };
    return getDrawDetailUseCase.run({ drawId });
  });

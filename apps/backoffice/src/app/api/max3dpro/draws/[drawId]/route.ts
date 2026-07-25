import { GetDrawDetailUseCase } from "@megawin/game-max3dpro-application/use-cases/draws";
import { CompanyRole } from "@megawin/identity/entities";

import { withApi } from "@/lib/api";

const useCase = new GetDrawDetailUseCase();

/**
 * GET /max3dpro/draws/[drawId]
 *
 * Chi tiết đầy đủ 1 kỳ quay Max 3D Pro: result, financial, stats.
 * Dùng cho draw command center trên trang operations.
 */
export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async ({ params }) => {
    const drawId = params.drawId ?? "";
    return useCase.run({ drawId });
  });

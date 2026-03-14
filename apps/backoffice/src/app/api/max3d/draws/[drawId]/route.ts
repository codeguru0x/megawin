import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities/account";
import { GetDrawDetailUseCase } from "@megawin/game-max3d-application/use-cases/draws";

const useCase = new GetDrawDetailUseCase();

/**
 * GET /max3d/draws/[drawId]
 *
 * Chi tiết đầy đủ 1 kỳ quay Max 3D: result, financial, stats.
 * Dùng cho draw command center trên trang operations.
 */
export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async ({ params }) => {
    const drawId = params.drawId ?? "";
    return useCase.run({ drawId });
  });

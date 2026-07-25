import { GetTopCombosUseCase } from "@megawin/game-max3d-application/use-cases/operations";
import { CompanyRole } from "@megawin/identity/entities";

import { withApi } from "@/lib/api";

import { topCombosQuerySchema } from "../_lib/schema";

const useCase = new GetTopCombosUseCase();

/**
 * GET /max3d/operations/top-combos?drawId=xxx&limit=10
 *
 * Top N bộ ba phổ biến nhất trong một kỳ quay Max 3D.
 * Trả về 2 danh sách: singleCombos (basic mode) + plusCombos (plus mode).
 */
export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(topCombosQuerySchema)
  .handler(async ({ query }) => {
    return useCase.run({
      drawId: query.drawId,
      limit: query.limit,
    });
  });

import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { GetTopCombosUseCase } from "@megawin/game-max3dpro-application/use-cases/operations";
import { topCombosQuerySchema } from "../_lib/schema";

const useCase = new GetTopCombosUseCase();

/**
 * GET /max3dpro/operations/top-combos?drawId=xxx&limit=10
 *
 * Top N cặp TripletPair phổ biến nhất trong một kỳ quay Max 3D Pro.
 * Max 3D Pro chỉ có 1 loại combo (ordered pair), khác Max 3D (basic + plus).
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

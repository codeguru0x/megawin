import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { GetTripletFrequencyUseCase } from "@megawin/game-max3d-application/use-cases/operations";
import { tripletFrequencyQuerySchema } from "../_lib/schema";

const useCase = new GetTripletFrequencyUseCase();

/**
 * GET /max3d/operations/triplet-frequency?drawId=xxx&limit=20
 *
 * Top N bộ ba số phổ biến nhất trong một kỳ quay hoặc ngày tài chính.
 * Không gian mẫu: 1000 bộ (000-999) → trả top N thay vì toàn bộ.
 */
export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(tripletFrequencyQuerySchema)
  .handler(async ({ query }) => {
    return useCase.run({
      financialDate: query.financialDate,
      drawId: query.drawId,
      limit: query.limit,
    });
  });

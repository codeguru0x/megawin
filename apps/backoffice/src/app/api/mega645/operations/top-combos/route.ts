import { GetTopCombosUseCase } from "@megawin/game-mega645-application/use-cases/operations";
import { CompanyRole } from "@megawin/identity/entities";
import { z } from "zod";

import { withApi } from "@/lib/api";

const useCase = new GetTopCombosUseCase();

/**
 * GET /mega645/operations/top-combos?drawId=xxx&limit=10
 *
 * Top N bộ số phổ biến nhất trong một kỳ quay Mega 6/45.
 * Rank theo entryCount (số entries chứa combo) giảm dần.
 * Mega 6/45: combo = playType + sorted numbers (không có specialNumbers).
 */
const topCombosQuerySchema = z.object({
  drawId: z.string().min(1, "drawId là bắt buộc."),
  limit: z.coerce.number().int().min(1).max(20).optional(),
});

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(topCombosQuerySchema)
  .handler(async ({ query }) => {
    return useCase.run({
      drawId: query.drawId,
      limit: query.limit,
    });
  });

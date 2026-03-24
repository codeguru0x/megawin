import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { GetTopCombosUseCase } from "@megawin/game-lotto535-application/use-cases/operations";
import { z } from "zod";

const useCase = new GetTopCombosUseCase();

/**
 * GET /lotto535/operations/top-combos?drawId=xxx&limit=10
 *
 * Top N bộ số phổ biến nhất trong một kỳ quay.
 * Rank theo entryCount (số entries chứa combo) giảm dần.
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

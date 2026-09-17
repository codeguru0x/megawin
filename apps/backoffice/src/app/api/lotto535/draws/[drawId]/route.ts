import { GetDrawDetailUseCase } from "@megawin/game-lotto535-application/use-cases/draws";
import { CompanyRole } from "@megawin/identity/entities";
import { z } from "zod";

import { withApi } from "@/lib/api";

const useCase = new GetDrawDetailUseCase();

/**
 * GET /lotto535/draws/:drawId
 *
 * Chi tiết đầy đủ 1 kỳ quay: result, jackpot snapshot, financial, stats, settleSummary.
 * Dùng cho dashboard vận hành để hiển thị kết quả & tài chính.
 */

const paramsSchema = z.object({
  drawId: z.string().min(1),
});
export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .params(paramsSchema)
  .handler(async ({ params }) => {
    const { drawId } = params;
    return useCase.run({ drawId });
  });

import { GetVietlottSuggestionUseCase } from "@megawin/game-power655-application/use-cases/draws";
import { CompanyRole } from "@megawin/identity/entities";
import { z } from "zod";

import { withApi } from "@/lib/api";

const getVietlottSuggestionUseCase = new GetVietlottSuggestionUseCase();

/**
 * GET /api/power655/draws/[drawId]/vietlott-suggestion
 *
 * Gợi ý mã kỳ Vietlott (`vietlottRef.drawPeriod`) cho dialog công bố kết quả — dùng
 * để prefill + hiện thông báo khi không suy được (overview §7.1).
 */

const paramsSchema = z.object({
  drawId: z.string().min(1),
});
export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .params(paramsSchema)
  .handler(async ({ params }) => {
    const { drawId } = params;
    return getVietlottSuggestionUseCase.run({ drawId });
  });

import { GetVietlottSuggestionUseCase } from "@megawin/game-bingo18-application/use-cases/draws";
import { CompanyRole } from "@megawin/identity/entities";

import { withApi } from "@/lib/api";

const getVietlottSuggestionUseCase = new GetVietlottSuggestionUseCase();

/**
 * GET /api/bingo18/draws/[drawId]/vietlott-suggestion
 *
 * Gợi ý mã kỳ Vietlott (`vietlottRef.drawPeriod`) cho dialog công bố kết quả — dùng
 * để prefill + hiện thông báo khi không suy được (overview §7.1).
 */
export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async ({ params }) => {
    const { drawId } = params as { drawId: string };
    return getVietlottSuggestionUseCase.run({ drawId });
  });

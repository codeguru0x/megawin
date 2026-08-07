import { GetComboLookupUseCase } from "@megawin/game-lotto535-application/use-cases/operations";
import { CompanyRole } from "@megawin/identity/entities";

import { withApi } from "@/lib/api";

import { comboLookupQuerySchema } from "../_lib/schema";

const useCase = new GetComboLookupUseCase();

/**
 * GET /api/lotto535/operations/combo-lookup
 *
 * Staff tra 1 board (bộ số theo playType) trong 1 kỳ: bao nhiêu người cược, tổng bộ/tiền,
 * breakdown account. Nguồn `lotto535_draw_combo_stats` (worker aggregate realtime).
 */
export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(comboLookupQuerySchema)
  .handler(async ({ query }) => {
    return useCase.run({
      drawId: query.drawId,
      playType: query.playType,
      mainNumbers: query.mainNumbers,
      specialNumbers: query.specialNumbers,
    });
  });

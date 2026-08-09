/**
 * Lambda handler: GET /games/bingo18/draw-results/{drawId}
 * Chi tiết kết quả 1 kỳ quay Bingo 18.
 *
 * Trả kết quả 3 số, tổng, và bảng giải thưởng theo từng loại chơi
 * (basic: singleNum/doubleMatch/tripleMatch; side bet: sumTotal/bigSmallDraw).
 * Chỉ trả giải có winnerCount > 0 trong kỳ.
 * Chỉ trả khi draw đã settle và có kết quả.
 */

import { withPlayerAuth } from "@megawin/auth";
import { GetDrawResultPlayerUseCase } from "@megawin/game-bingo18-application/use-cases/player";
import { DRAW_ID_REGEX } from "@megawin/shared/constants";
import { z } from "zod";

const pathSchema = z.object({
  drawId: z.string().regex(DRAW_ID_REGEX, "Kỳ quay thưởng phải có định dạng YYYY-MM-DD.NNN"),
});

const useCase = new GetDrawResultPlayerUseCase();

export const handler = withPlayerAuth(
  async (event) => {
    const { drawId } = event.schema.path;

    return useCase.run({ drawId });
  },
  { schemas: { path: pathSchema } },
);

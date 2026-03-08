/**
 * Lambda handler: GET /games/keno/draw-results/{drawId}
 * Chi tiết kết quả 1 kỳ quay Keno.
 */

import { z } from "zod";
import { withPlayerAuth } from "@megawin/auth";
import { GetDrawResultPlayerUseCase } from "@megawin/game-keno-application/use-cases/player";
import { DRAW_ID_REGEX } from "@megawin/shared/constants/validation";

const pathSchema = z.object({
  drawId: z.string().regex(DRAW_ID_REGEX, "Expected drawId format YYYY-MM-DD.NNN"),
});

const useCase = new GetDrawResultPlayerUseCase();

export const handler = withPlayerAuth(
  async (event) => {
    const { drawId } = event.schema.path;

    return useCase.run({ drawId });
  },
  { schemas: { path: pathSchema } },
);

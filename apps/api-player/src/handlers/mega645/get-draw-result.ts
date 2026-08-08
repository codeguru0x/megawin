/**
 * Lambda handler: GET /games/mega645/draw-results/{drawId}
 * Chi tiết kết quả 1 kỳ quay Mega 6/45.
 */

import { withPlayerAuth } from "@megawin/auth";
import { GetDrawResultPlayerUseCase } from "@megawin/game-mega645-application/use-cases/player";
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

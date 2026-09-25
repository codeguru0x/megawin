/**
 * Lambda handler: GET /games/keno/draw-results/{drawId}
 * Chi tiết kết quả 1 kỳ quay Keno.
 */

import { withPlayerAuth } from "@megawin/auth";
import { GetDrawResultPlayerUseCase } from "@megawin/game-keno-application/use-cases/player";
import { DRAW_ID_REGEX } from "@megawin/shared/constants";
import { z } from "zod";

import { READ_RATE_LIMIT } from "#lib/rate-limit";

const pathSchema = z.object({
  drawId: z.string().regex(DRAW_ID_REGEX, "Expected drawId format YYYY-MM-DD.NNN"),
});

const useCase = new GetDrawResultPlayerUseCase();

export const handler = withPlayerAuth(
  async (event) => {
    const { drawId } = event.schema.path;

    return useCase.run({ drawId });
  },
  {
    schemas: { path: pathSchema },
    rateLimit: { route: "keno.draw-result", ...READ_RATE_LIMIT },
  },
);

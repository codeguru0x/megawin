/**
 * Lambda handler: GET /games/max3d/draw-results/{drawId}
 * Chi tiết kết quả 1 kỳ quay Max 3D.
 *
 * Trả kết quả 20 bộ ba số (chia theo 4 hạng giải), và bảng giải thưởng
 * gộp cả 2 mode basic (4 hạng) + plus (7 hạng).
 * Chỉ trả khi draw đã settle và có kết quả.
 */

import { z } from "zod";
import { withPlayerAuth } from "@megawin/auth";
import { GetDrawResultPlayerUseCase } from "@megawin/game-max3d-application/use-cases/player";
import { DRAW_ID_REGEX } from "@megawin/shared/constants";

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

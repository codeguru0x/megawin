/**
 * Lambda handler: GET /games/power655/draws/{drawId}/combo-popularity
 *
 * Minh bạch chia jackpot cho player — trả số bộ cùng cược bộ số mà CHÍNH player đã đặt
 * trong kỳ (ownership-gate). Combo lạ luôn trả `{ found: false }`. Bộ 6 số standard kèm
 * `jackpotUnits` (mẫu số chia JP1). Board Bao chỉ trả `sets`.
 *
 * `numbers` truyền qua query multi-value zero-padded: `?numbers=01,05,12,...` (hoặc repeated
 * `?numbers=01&numbers=05`) — 5–18 số.
 */

import { withPlayerAuth } from "@megawin/auth";
import { power655MainNumberSchema } from "@megawin/game-power655/schemas";
import { GetComboPopularityPlayerUseCase } from "@megawin/game-power655-application/use-cases/player";
import { DRAW_ID_REGEX } from "@megawin/shared/constants";
import { multiValueQuery } from "@megawin/shared/validation";
import { z } from "zod";

const pathSchema = z.object({
  drawId: z.string().regex(DRAW_ID_REGEX, "Expected drawId format YYYY-MM-DD.NNN"),
});

const querySchema = z.object({
  // Multi-value query "01,05,12,..." → mảng số Power 6/55 "01".."55" (5–18 số).
  // AWS HTTP API (payload 2.0) nối repeated param bằng phẩy nên `?numbers=01&numbers=05`
  // và `?numbers=01,05` cùng ra 1 chuỗi. Ràng buộc playType (5/6/7–15/18) + distinct do
  // use-case đảm nhiệm.
  numbers: multiValueQuery(z.array(power655MainNumberSchema).min(5).max(18)),
});

const useCase = new GetComboPopularityPlayerUseCase();

export const handler = withPlayerAuth(
  async (event) => {
    const { accountId } = event.user;
    const { drawId } = event.schema.path;
    const { numbers } = event.schema.query;

    return useCase.run({ accountId, drawId, numbers });
  },
  { schemas: { path: pathSchema, query: querySchema } },
);

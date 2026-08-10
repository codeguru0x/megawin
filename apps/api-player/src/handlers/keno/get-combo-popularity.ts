/**
 * Lambda handler: GET /games/keno/draws/{drawId}/combo-popularity
 *
 * Minh bạch combo cappable (pick8/9/10) cho player — trả số người/số bộ cùng cược combo
 * mà CHÍNH player đã đặt trong kỳ (ownership-gate). Combo lạ luôn trả `{ found: false }`.
 *
 * `numbers` truyền qua query multi-value zero-padded: `?numbers=01,05,12,...` (hoặc repeated
 * `?numbers=01&numbers=05`) — 8–10 số.
 */

import { withPlayerAuth } from "@megawin/auth";
import { kenoNumberSchema } from "@megawin/game-keno/schemas";
import { GetComboPopularityPlayerUseCase } from "@megawin/game-keno-application/use-cases/player";
import { DRAW_ID_REGEX } from "@megawin/shared/constants";
import { multiValueQuery } from "@megawin/shared/validation";
import { z } from "zod";

const pathSchema = z.object({
  drawId: z.string().regex(DRAW_ID_REGEX, "Expected drawId format YYYY-MM-DD.NNN"),
});

const querySchema = z.object({
  // Multi-value query "01,05,12,..." → mảng số Keno "01".."80" (8–10 số).
  // AWS HTTP API (payload 2.0) nối repeated param bằng phẩy nên `?numbers=01&numbers=05`
  // và `?numbers=01,05` cùng ra 1 chuỗi. Ràng buộc 8–10 số + distinct do use-case đảm nhiệm.
  numbers: multiValueQuery(z.array(kenoNumberSchema).min(8).max(10)),
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

/**
 * Lambda handler: GET /games/keno/draws/{drawId}/combo-popularity
 *
 * Minh bạch combo cappable (pick8/9/10) cho player — trả số người/số bộ cùng cược combo
 * mà CHÍNH player đã đặt trong kỳ (ownership-gate). Combo lạ luôn trả `{ found: false }`.
 *
 * `numbers` truyền qua query dạng CSV zero-padded: `?numbers=01,05,12,...` (8–10 số).
 */

import { withPlayerAuth } from "@megawin/auth";
import { kenoNumberSchema } from "@megawin/game-keno/schemas";
import { GetComboPopularityPlayerUseCase } from "@megawin/game-keno-application/use-cases/player";
import { DRAW_ID_REGEX } from "@megawin/shared/constants";
import { z } from "zod";

const pathSchema = z.object({
  drawId: z.string().regex(DRAW_ID_REGEX, "Expected drawId format YYYY-MM-DD.NNN"),
});

const querySchema = z.object({
  // CSV "01,05,12,..." → tách + validate mỗi phần tử là số Keno hợp lệ "01".."80".
  // Ràng buộc 8–10 số + distinct do use-case đảm nhiệm (đồng nhất với staff lookup).
  numbers: z
    .string()
    .transform((s) =>
      s
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean),
    )
    .pipe(z.array(kenoNumberSchema).min(8).max(10)),
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

/**
 * Lambda handler: GET /games/mega645/draws/{drawId}/combo-popularity
 *
 * Minh bạch chia jackpot cho player — trả số bộ cùng cược bộ số mà CHÍNH player đã đặt
 * trong kỳ (ownership-gate). Combo lạ luôn trả `{ found: false }`. Bộ 6 số standard kèm
 * `jackpotUnits` (mẫu số chia jackpot). Board Bao chỉ trả `sets` + `boardPrice`.
 *
 * `numbers` truyền qua query dạng CSV zero-padded: `?numbers=01,05,12,...` (5–18 số).
 */

import { z } from "zod";
import { withPlayerAuth } from "@megawin/auth";
import { GetComboPopularityPlayerUseCase } from "@megawin/game-mega645-application/use-cases/player";
import { mega645NumberSchema } from "@megawin/game-mega645/schemas";
import { DRAW_ID_REGEX } from "@megawin/shared/constants";

const pathSchema = z.object({
  drawId: z.string().regex(DRAW_ID_REGEX, "Expected drawId format YYYY-MM-DD.NNN"),
});

const querySchema = z.object({
  // CSV "01,05,12,..." → tách + validate mỗi phần tử là số Mega 6/45 hợp lệ "01".."45".
  // Ràng buộc playType hợp lệ (5/6/7–15/18) + distinct do use-case đảm nhiệm.
  numbers: z
    .string()
    .transform((s) =>
      s
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean),
    )
    .pipe(z.array(mega645NumberSchema).min(5).max(18)),
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

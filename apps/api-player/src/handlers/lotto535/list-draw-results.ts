/**
 * Lambda handler: GET /games/lotto535/draw-results
 * Danh sách kết quả kỳ quay Lotto 5/35 đã settle.
 */

import { z } from "zod";
import { withPlayerAuth } from "@megawin/auth";
import { ListDrawResultsPlayerUseCase } from "@megawin/game-lotto535-application/use-cases/player";
import { ISO_DATE_REGEX, DRAW_ID_REGEX } from "@megawin/shared/constants";
import { todayVN } from "@megawin/shared/utils";
import { sizeSchema } from "#lib/schemas";

const querySchema = z.object({
  size: sizeSchema,
  from: z.string().regex(ISO_DATE_REGEX, "Ngày bắt đầu phải có định dạng YYYY-MM-DD").optional(),
  cursor: z
    .string()
    .regex(DRAW_ID_REGEX, "Kỳ quay thưởng phải có định dạng YYYY-MM-DD.NNN")
    .optional(),
});

const useCase = new ListDrawResultsPlayerUseCase();

export const handler = withPlayerAuth(
  async (event) => {
    const { size, cursor } = event.schema.query;
    // Default from = hôm nay (giờ VN) → tận dụng index {drawDate: -1} thay vì scan toàn bộ.
    // Khi paginate (có cursor), client phải truyền cùng from để giữ đúng range.
    const from = event.schema.query.from ?? todayVN();

    return useCase.run({ size, from, cursor });
  },
  { schemas: { query: querySchema } },
);

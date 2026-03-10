/**
 * Lambda handler: GET /games/bingo18/draw-results
 * Danh sách kết quả kỳ quay Bingo 18 đã settle.
 *
 * Cursor-based pagination: from (YYYY-MM-DD) + size + cursor (drawId).
 * Mặc định from = ngày hôm nay (giờ VN).
 * Bingo 18 quay mỗi 6 phút (~240 kỳ/ngày) → pagination đặc biệt quan trọng.
 */

import { z } from "zod";
import { withPlayerAuth } from "@megawin/auth";
import { ListDrawResultsPlayerUseCase } from "@megawin/game-bingo18-application/use-cases/player";
import { ISO_DATE_REGEX, DRAW_ID_REGEX } from "@megawin/shared/constants/validation";
import { todayVN } from "@megawin/shared/utils/date";
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
    // Default from = hôm nay (giờ VN).
    // Bingo 18 có ~240 kỳ/ngày → đặc biệt quan trọng để tránh full scan.
    // Khi paginate (có cursor), client phải truyền cùng from để giữ đúng range.
    const from = event.schema.query.from ?? todayVN();

    return useCase.run({ size, from, cursor });
  },
  { schemas: { query: querySchema } },
);

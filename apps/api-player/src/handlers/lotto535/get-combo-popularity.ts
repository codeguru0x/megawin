/**
 * Lambda handler: GET /games/lotto535/draws/{drawId}/combo-popularity
 *
 * Minh bạch chia Jackpot + cơ chế split cho player (p1-01) — trả độ đông (`sets`) và, khi
 * tra bộ CHUẨN (5 chính + 1 ĐB), mẫu số chia Jackpot (`jackpotUnits`) mà CHÍNH player đã
 * cược trong kỳ (ownership-gate). Combo lạ luôn trả `{ found: false }`.
 *
 * `numbers`/`specials` truyền qua query dạng CSV zero-padded:
 * `?numbers=01,05,12,20,33&specials=07`.
 */

import { z } from "zod";
import { withPlayerAuth } from "@megawin/auth";
import { GetComboPopularityPlayerUseCase } from "@megawin/game-lotto535-application/use-cases/player";
import {
  lotto535MainNumberSchema,
  lotto535SpecialNumberSchema,
} from "@megawin/game-lotto535/schemas";
import { DRAW_ID_REGEX } from "@megawin/shared/constants";

const pathSchema = z.object({
  drawId: z.string().regex(DRAW_ID_REGEX, "Expected drawId format YYYY-MM-DD.NNN"),
});

const csvToArray = (s: string) =>
  s
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);

const querySchema = z.object({
  // CSV "01,05,..." — 4-15 số chính, distinct (đồng bộ pattern staff comboLookupQuerySchema).
  // Khớp playType (VD 4+1 mainCover4, 5+1 standard, 6-15+1 mainCover) do use-case đảm nhiệm
  // qua `inferPlayType` — Zod route không biết trước tổ hợp nào hợp lệ (rule §8: cross-field
  // phụ thuộc domain rule, không phải re-check thứ Zod đã làm).
  numbers: z
    .string()
    .transform(csvToArray)
    .pipe(
      z
        .array(lotto535MainNumberSchema)
        .min(4)
        .max(15)
        .refine((arr) => new Set(arr).size === arr.length, "Số chính bị trùng."),
    ),
  // CSV "07" hoặc "01,03,..." — 1-12 số đặc biệt, distinct.
  specials: z
    .string()
    .transform(csvToArray)
    .pipe(
      z
        .array(lotto535SpecialNumberSchema)
        .min(1)
        .max(12)
        .refine((arr) => new Set(arr).size === arr.length, "Số đặc biệt bị trùng."),
    ),
});

const useCase = new GetComboPopularityPlayerUseCase();

export const handler = withPlayerAuth(
  async (event) => {
    const { accountId } = event.user;
    const { drawId } = event.schema.path;
    const { numbers, specials } = event.schema.query;

    return useCase.run({ accountId, drawId, numbers, specials });
  },
  { schemas: { path: pathSchema, query: querySchema } },
);

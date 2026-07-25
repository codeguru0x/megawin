import { BINGO18_DICE_MAX, BINGO18_DICE_MIN, BINGO18_DRAW_COUNT } from "@megawin/game-bingo18/entities";
import { z } from "zod";

const numbersSchema = z
  .array(z.number().int().min(BINGO18_DICE_MIN).max(BINGO18_DICE_MAX))
  .length(BINGO18_DRAW_COUNT, `Phải có đúng ${BINGO18_DRAW_COUNT} số.`);

const vietlottRefObjectSchema = z.object({
  drawPeriod: z.string().min(1),
  drawDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * Body schema cho `publish-result` — single entry point cho "nhập/sửa kết quả".
 *
 * Nhận `numbers` + `vietlottRef?` cùng lúc (mọi trạng thái dùng chung form).
 * Use case tự phân biệt: publish lần đầu, republish sau settle (kéo resettle),
 * hay chỉ cập nhật vietlottRef (KHÔNG resettle) dựa trên `settledAt` và so sánh
 * numbers cũ vs mới.
 */
export const publishResultSchema = z.object({
  numbers: numbersSchema,
  vietlottRef: vietlottRefObjectSchema.optional(),
});
export type PublishResultBody = z.infer<typeof publishResultSchema>;

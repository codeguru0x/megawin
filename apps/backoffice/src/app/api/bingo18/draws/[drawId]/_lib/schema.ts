import { z } from "zod";
import {
  BINGO18_DRAW_COUNT,
  BINGO18_DICE_MIN,
  BINGO18_DICE_MAX,
} from "@megawin/game-bingo18/entities";

const numbersSchema = z
  .array(z.number().int().min(BINGO18_DICE_MIN).max(BINGO18_DICE_MAX))
  .length(BINGO18_DRAW_COUNT, `Phải có đúng ${BINGO18_DRAW_COUNT} số.`);

const vietlottRefObjectSchema = z.object({
  drawPeriod: z.string().min(1),
  drawDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * Body schema cho `publish-result` — publish kết quả lần đầu (Sales/Published).
 *
 * Cho phép gửi kèm `vietlottRef` vì lúc publish lần đầu staff thường nhập
 * đồng thời số trúng + tham chiếu Vietlott.
 */
export const publishResultSchema = z.object({
  numbers: numbersSchema,
  vietlottRef: vietlottRefObjectSchema.optional(),
});
export type PublishResultBody = z.infer<typeof publishResultSchema>;

/**
 * Body schema cho `republish-result` — sửa kết quả sau settle (kéo resettle).
 *
 * KHÔNG nhận `vietlottRef` — sửa metadata tham chiếu thuộc endpoint riêng
 * `vietlott-ref` để không kéo theo resettle không cần thiết.
 */
export const republishResultSchema = z.object({
  numbers: numbersSchema,
});
export type RepublishResultBody = z.infer<typeof republishResultSchema>;

/**
 * Body schema cho `vietlott-ref` — sửa CHỈ metadata tham chiếu Vietlott.
 *
 * `vietlottRef` không tham gia matching/payout → cập nhật KHÔNG yêu cầu
 * resettle. Use case enforce status `Published`/`Settling`/`Settled`.
 */
export const vietlottRefSchema = vietlottRefObjectSchema;
export type VietlottRefBody = z.infer<typeof vietlottRefSchema>;

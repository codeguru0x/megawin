import { z } from "zod";
import { KENO_DRAW_COUNT } from "@megawin/game-keno/entities";

const kenoNumberSchema = z.string().regex(/^(0[1-9]|[1-7][0-9]|80)$/);

const winningNumbersSchema = z
  .array(kenoNumberSchema)
  .length(KENO_DRAW_COUNT, `Phải có đúng ${KENO_DRAW_COUNT} số.`)
  .refine((arr) => new Set(arr).size === arr.length, {
    message: "Các số phải khác nhau.",
  });

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
  winningNumbers: winningNumbersSchema,
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
  winningNumbers: winningNumbersSchema,
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

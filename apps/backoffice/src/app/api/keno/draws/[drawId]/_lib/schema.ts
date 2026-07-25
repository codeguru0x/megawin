import { KENO_DRAW_COUNT } from "@megawin/game-keno/entities";
import { z } from "zod";

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
 * Body schema cho `publish-result` — single entry point cho "nhập/sửa kết quả".
 *
 * Nhận `winningNumbers` + `vietlottRef?` cùng lúc (mọi trạng thái dùng chung
 * form). Use case tự phân biệt: publish lần đầu, republish sau settle (kéo
 * resettle), hay chỉ cập nhật vietlottRef (KHÔNG resettle) dựa trên `settledAt`
 * và so sánh winningNumbers cũ vs mới.
 */
export const publishResultSchema = z.object({
  winningNumbers: winningNumbersSchema,
  vietlottRef: vietlottRefObjectSchema.optional(),
});
export type PublishResultBody = z.infer<typeof publishResultSchema>;

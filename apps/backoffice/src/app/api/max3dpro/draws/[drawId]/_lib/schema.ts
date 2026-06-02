import { z } from "zod";
import {
  MAX3D_PRO_DRAW_COUNT_SPECIAL,
  MAX3D_PRO_DRAW_COUNT_FIRST,
  MAX3D_PRO_DRAW_COUNT_SECOND,
  MAX3D_PRO_DRAW_COUNT_THIRD,
} from "@megawin/game-max3dpro/entities";

const tripletSchema = z.string().regex(/^\d{3}$/, "Bộ ba số phải là 3 chữ số (000-999).");

const resultSchema = z.object({
  special: z
    .array(tripletSchema)
    .length(
      MAX3D_PRO_DRAW_COUNT_SPECIAL,
      `Giải Đặc Biệt phải có đúng ${MAX3D_PRO_DRAW_COUNT_SPECIAL} bộ ba số.`,
    ),
  first: z
    .array(tripletSchema)
    .length(
      MAX3D_PRO_DRAW_COUNT_FIRST,
      `Giải Nhất phải có đúng ${MAX3D_PRO_DRAW_COUNT_FIRST} bộ ba số.`,
    ),
  second: z
    .array(tripletSchema)
    .length(
      MAX3D_PRO_DRAW_COUNT_SECOND,
      `Giải Nhì phải có đúng ${MAX3D_PRO_DRAW_COUNT_SECOND} bộ ba số.`,
    ),
  third: z
    .array(tripletSchema)
    .length(
      MAX3D_PRO_DRAW_COUNT_THIRD,
      `Giải Ba phải có đúng ${MAX3D_PRO_DRAW_COUNT_THIRD} bộ ba số.`,
    ),
});

const vietlottRefObjectSchema = z.object({
  drawPeriod: z.string().min(1),
  drawDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * Body schema cho `publish-result` — single entry point cho mọi thao tác
 * nhập/sửa kết quả (lần đầu, sửa trước settle, sửa sau settle, hoặc chỉ sửa
 * vietlottRef). Use case tự quyết định resettle dựa trên `settledAt` + so sánh
 * result cũ/mới. `vietlottRef` optional.
 */
export const publishResultSchema = z.object({
  result: resultSchema,
  vietlottRef: vietlottRefObjectSchema.optional(),
});
export type PublishResultBody = z.infer<typeof publishResultSchema>;

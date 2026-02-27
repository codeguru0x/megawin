import { z } from "zod";
import { DrawNo } from "@megawin/game-lotto535/entities";
import { DRAW_STATUS_VALUES } from "@megawin/game-core/entities";

export const createDrawSchema = z.object({
  drawDate: z.iso.date("drawDate phải là ngày hợp lệ format YYYY-MM-DD."),
  drawNo: z.union([z.literal(DrawNo.Morning), z.literal(DrawNo.Evening)], {
    message: "drawNo chỉ chấp nhận 1 (kỳ 13h) hoặc 2 (kỳ 21h).",
  }),
});

export const listDrawsQuerySchema = z.object({
  status: z
    .enum(DRAW_STATUS_VALUES as [string, ...string[]])
    .optional(),
  fromDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "fromDate phải là YYYY-MM-DD.")
    .optional(),
  toDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "toDate phải là YYYY-MM-DD.")
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(100).default(20),
});

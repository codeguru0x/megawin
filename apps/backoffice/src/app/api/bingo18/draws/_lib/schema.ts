import { DRAW_STATUS_VALUES } from "@megawin/game-core/entities";
import { z } from "zod";

export const createDrawSchema = z.object({
  draws: z
    .array(
      z.object({
        drawDate: z.iso.date("drawDate phải là ngày hợp lệ format YYYY-MM-DD."),
        drawNo: z.coerce.number().int().min(1).max(999),
        drawTime: z.string().min(1, "drawTime không được rỗng."),
        openNow: z.boolean().default(false),
      }),
    )
    .min(1)
    .max(30),
});

export const previewDrawsSchema = z.object({
  count: z.coerce.number().int().min(1).max(30).default(10),
});

export const listDrawsQuerySchema = z.object({
  status: z.enum(DRAW_STATUS_VALUES as [string, ...string[]]).optional(),
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

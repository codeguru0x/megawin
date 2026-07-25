import { DRAW_STATUS_VALUES } from "@megawin/game-core/entities";
import { z } from "zod";

const createDrawItemSchema = z.object({
  /** Ngày quay theo lịch T2/T4/T6, format YYYY-MM-DD. */
  drawDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "drawDate phải là YYYY-MM-DD."),
  /** Giờ quay (ISO 8601 với timezone offset, VD: `2026-04-07T18:00:00+07:00`). */
  drawTime: z.iso.datetime({ offset: true }),
  /** Mở bán ngay khi tạo xong. */
  openNow: z.boolean().default(true),
});

export const createDrawSchema = z.object({
  draws: z.array(createDrawItemSchema).min(1).max(12),
});

export const previewDrawsSchema = z.object({
  count: z.coerce.number().int().min(1).max(12).default(2),
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

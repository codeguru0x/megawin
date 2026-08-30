import { DRAW_STATUS_VALUES } from "@megawin/game-core/entities";
import { MAX3D_PRO_CREATE_DRAW_BATCH_MAX } from "@megawin/game-max3dpro/schemas";
import { z } from "zod";

const createDrawItemSchema = z.object({
  /** Ngày quay theo lịch T3/T5/T7, format YYYY-MM-DD. */
  drawDate: z.iso.date("drawDate phải là YYYY-MM-DD."),
  /** Giờ quay (ISO 8601 với timezone offset, VD: `2026-04-08T18:00:00+07:00`). */
  drawTime: z.iso.datetime({ offset: true }),
  /** Mở bán ngay khi tạo xong. */
  openNow: z.boolean().default(true),
});

export const createDrawSchema = z.object({
  draws: z.array(createDrawItemSchema).min(1).max(MAX3D_PRO_CREATE_DRAW_BATCH_MAX),
});

export const previewDrawsSchema = z.object({
  count: z.coerce.number().int().min(1).max(MAX3D_PRO_CREATE_DRAW_BATCH_MAX).default(2),
});

export const listDrawsQuerySchema = z.object({
  status: z.enum(DRAW_STATUS_VALUES as [string, ...string[]]).optional(),
  fromDate: z.iso.date("fromDate phải là YYYY-MM-DD.").optional(),
  toDate: z.iso.date("toDate phải là YYYY-MM-DD.").optional(),
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(100).default(20),
});

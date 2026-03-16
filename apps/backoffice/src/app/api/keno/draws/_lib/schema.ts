import { z } from "zod";
import { DRAW_STATUS_VALUES } from "@megawin/game-core/entities";

const createDrawSlotSchema = z.object({
  /** Ngày quay, format YYYY-MM-DD. */
  drawDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "drawDate phải là YYYY-MM-DD."),
  /**
   * Giờ quay, ISO 8601 có timezone offset (ví dụ: "2026-03-20T06:08:00+07:00").
   * closeAt tính tự động phía server.
   */
  drawTime: z.iso.datetime({ offset: true }),
  /** Mở bán ngay sau khi tạo. */
  openNow: z.boolean().default(false),
});

export const createDrawSchema = z.object({
  draws: z
    .array(createDrawSlotSchema)
    .min(1, "Cần ít nhất 1 kỳ.")
    .max(30, "Tối đa 30 kỳ mỗi lần tạo."),
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

import { DRAW_STATUS_VALUES } from "@megawin/game-core/entities";
import { KENO_CREATE_DRAW_BATCH_MAX } from "@megawin/game-keno/schemas";
import { z } from "zod";

const createDrawSlotSchema = z.object({
  /** Ngày quay, format YYYY-MM-DD. */
  drawDate: z.iso.date("drawDate phải là YYYY-MM-DD."),
  /**
   * Giờ quay, ISO 8601 có timezone offset (ví dụ: "2026-03-20T06:08:00+07:00").
   * closeAt tính tự động phía server.
   */
  drawTime: z.iso.datetime({ offset: true }),
  /** Mở bán ngay sau khi tạo. */
  openNow: z.boolean().default(false),
});

export const createDrawSchema = z.object({
  // Trần rộng để đủ tạo 1 ngày (~120 kỳ, lịch mặc định 8 phút/kỳ) + 1 ngày kế tiếp trong
  // cùng batch — giới hạn CHÍNH XÁC (drawsPerDay × 2 ngày) được use-case tính lại theo
  // GlobalConfig thật tại thời điểm tạo, Zod chỉ chặn input vô lý (batch quá khổ).
  draws: z
    .array(createDrawSlotSchema)
    .min(1, "Cần ít nhất 1 kỳ.")
    .max(KENO_CREATE_DRAW_BATCH_MAX, `Tối đa ${KENO_CREATE_DRAW_BATCH_MAX} kỳ mỗi lần tạo.`),
});

export const previewDrawsSchema = z.object({
  count: z.coerce.number().int().min(1).max(KENO_CREATE_DRAW_BATCH_MAX).default(10),
});

export const listDrawsQuerySchema = z.object({
  status: z.enum(DRAW_STATUS_VALUES as [string, ...string[]]).optional(),
  fromDate: z.iso.date("fromDate phải là YYYY-MM-DD.").optional(),
  toDate: z.iso.date("toDate phải là YYYY-MM-DD.").optional(),
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(100).default(20),
});

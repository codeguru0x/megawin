import { BINGO18_CREATE_DRAW_BATCH_MAX } from "@megawin/game-bingo18/schemas";
import { DRAW_STATUS_VALUES } from "@megawin/game-core/entities";
import { z } from "zod";

export const createDrawSchema = z.object({
  draws: z
    .array(
      z.object({
        drawDate: z.iso.date("drawDate phải là ngày hợp lệ format YYYY-MM-DD."),
        drawTime: z.string().min(1, "drawTime không được rỗng."),
        openNow: z.boolean().default(false),
      }),
    )
    .min(1)
    // Trần rộng để đủ tạo 1 ngày (~158 kỳ, lịch mặc định 6 phút/kỳ) + 1 ngày kế tiếp trong
    // cùng batch — giới hạn CHÍNH XÁC (drawsPerDay × 2 ngày) được use-case tính lại theo
    // GlobalConfig thật tại thời điểm tạo, Zod chỉ chặn input vô lý (batch quá khổ).
    .max(BINGO18_CREATE_DRAW_BATCH_MAX, `Tối đa ${BINGO18_CREATE_DRAW_BATCH_MAX} kỳ mỗi lần tạo.`),
});

export const previewDrawsSchema = z.object({
  count: z.coerce.number().int().min(1).max(BINGO18_CREATE_DRAW_BATCH_MAX).default(10),
});

export const listDrawsQuerySchema = z.object({
  status: z.enum(DRAW_STATUS_VALUES as [string, ...string[]]).optional(),
  fromDate: z.iso.date("fromDate phải là YYYY-MM-DD.").optional(),
  toDate: z.iso.date("toDate phải là YYYY-MM-DD.").optional(),
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(100).default(20),
});

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
    // Trần rộng để đủ tạo trọn 1 ngày (~158 kỳ với lịch mặc định 6 phút/kỳ). Giới hạn CHÍNH
    // XÁC (sức chứa còn lại của ngày) do use-case tính theo GlobalConfig thật + kỳ đã có trong
    // DB — Zod chỉ chặn input vô lý (lô quá khổ).
    //
    // Ràng buộc "cả lô phải cùng 1 drawDate" KHÔNG kiểm ở đây mà ở use-case: thông báo lỗi cần
    // nêu 2 ngày cụ thể đang lẫn nhau, và use-case là nơi duy nhất chịu trách nhiệm về mọi
    // guard nghiệp vụ của lô (route có thể bị bypass bởi caller nội bộ khác).
    .max(BINGO18_CREATE_DRAW_BATCH_MAX, `Tối đa ${BINGO18_CREATE_DRAW_BATCH_MAX} kỳ mỗi lần tạo.`),
});

/**
 * Query của `GET /api/bingo18/draws/preview`.
 *
 * Chỉ nhận `drawDate` — KHÔNG còn `count` như bản cũ. Lý do: preview trả về TOÀN BỘ slot còn
 * tạo được của ngày đó (tập hợp này không phụ thuộc số kỳ staff muốn tạo), client tự cắt
 * theo số lượng. Nhờ vậy đổi số kỳ trên UI không phát sinh request mới.
 *
 * `drawDate` optional: bỏ trống ⇒ use-case default về hôm nay (giờ VN). KHÔNG default ở đây
 * vì "hôm nay" phải tính theo giờ VN, còn schema thì không nên chứa logic timezone.
 */
export const previewDrawsSchema = z.object({
  drawDate: z.iso.date("drawDate phải là YYYY-MM-DD.").optional(),
});

export const listDrawsQuerySchema = z.object({
  status: z.enum(DRAW_STATUS_VALUES as [string, ...string[]]).optional(),
  fromDate: z.iso.date("fromDate phải là YYYY-MM-DD.").optional(),
  toDate: z.iso.date("toDate phải là YYYY-MM-DD.").optional(),
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(100).default(20),
});

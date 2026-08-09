/**
 * Keno – Zod Validation Schemas
 *
 * Reusable validation schemas dùng chung cho toàn bộ Keno frontend/backend:
 *   - API Gateway handler: validate request body trước khi xử lý
 *   - Next.js Server Action: validate form data trước khi gọi API
 *   - Client-side form: báo lỗi sớm cho user (UX)
 *
 * Quy ước:
 * - Số gửi lên API dạng string zero-padded ("01"-"80")
 * - drawId format: "YYYY-MM-DD.NNN"
 * - boards: cách chơi cơ bản (pick 1-10 số)
 * - sideBets: cách chơi bổ sung (Lớn/Nhỏ, Chẵn/Lẻ)
 *
 * Import: `import { publishResultSchema, ... } from "@megawin/game-keno/schemas"`
 */

import { z } from "zod";

import { KENO_DRAW_COUNT, KENO_NUMBER_MAX, KENO_NUMBER_MIN } from "../entities/types";

// ─── Atomic schemas ───

/** Schema validate 1 số Keno hợp lệ: string "01"-"80" (zero-padded). */
export const kenoNumberSchema = z.string().regex(/^(0[1-9]|[1-7][0-9]|80)$/, "Số Keno phải từ '01' đến '80'");

/** Schema validate drawId Keno: "YYYY-MM-DD.NNN". */
export const kenoDrawIdSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}\.\d{3}$/, "Format: YYYY-MM-DD.NNN");

// ─── Publish Result ────────────────────────────────────────────────────────────

/**
 * Schema validate 20 số trúng thưởng kỳ quay Keno.
 *
 * Dùng chung bởi:
 * - `PublishResultAction` (client form — staff nhập kết quả)
 * - API route handler `POST /api/keno/draws/[drawId]/publish-result` (server-side)
 *
 * Validate:
 * - Mỗi số phải là integer trong [KENO_NUMBER_MIN, KENO_NUMBER_MAX]
 * - Đúng KENO_DRAW_COUNT (20) phần tử
 * - Tất cả số phải khác nhau (không trùng lặp)
 */
export const publishResultSchema = z.object({
  winningNumbers: z
    .array(
      z
        .string()
        .min(1, "Chưa nhập số")
        .refine(
          (v) => {
            const n = Number(v);
            return Number.isInteger(n) && n >= KENO_NUMBER_MIN && n <= KENO_NUMBER_MAX;
          },
          `Phải là số nguyên từ ${String(KENO_NUMBER_MIN).padStart(2, "0")} đến ${String(KENO_NUMBER_MAX).padStart(2, "0")}`,
        ),
    )
    .length(KENO_DRAW_COUNT, `Cần đúng ${KENO_DRAW_COUNT} số`)
    .refine((nums) => new Set(nums.map(Number)).size === KENO_DRAW_COUNT, "Các số phải khác nhau"),
});

/** Inferred type từ publishResultSchema. */
export type PublishResultInput = z.infer<typeof publishResultSchema>;

// ─── Edit Schedule ─────────────────────────────────────────────────────────────

/**
 * Schema validate form sửa lịch kỳ quay Keno.
 *
 * Dùng bởi `EditScheduleAction` (client form) và API route handler.
 *
 * Chiến lược validate 2 tầng:
 * - Client: chỉ kiểm tra rule cơ bản `salesCloseAt < drawAt`
 * - Server: kiểm tra thêm buffer `salesCloseBeforeSeconds` từ game config
 *
 * Lý do tách: `salesCloseBeforeSeconds` là runtime config có thể thay đổi
 * bởi staff. Validate trên client dùng giá trị đã load có thể out-of-sync
 * khi config được sửa giữa chừng → server là source of truth.
 *
 * Time format: "HH:mm:ss" — Keno chu kỳ 8 phút, cần độ chính xác đến giây.
 */
export const editScheduleSchema = z
  .object({
    salesOpenDate: z.string().min(1, "Chưa chọn ngày"),
    salesOpenTime: z.string().min(1, "Chưa nhập giờ"),
    salesCloseDate: z.string().min(1, "Chưa chọn ngày"),
    salesCloseTime: z.string().min(1, "Chưa nhập giờ"),
    drawDate: z.string().min(1, "Chưa chọn ngày"),
    drawTime: z.string().min(1, "Chưa nhập giờ"),
  })
  .superRefine((data, ctx) => {
    const closeISO = `${data.salesCloseDate}T${data.salesCloseTime}+07:00`;
    const drawISO = `${data.drawDate}T${data.drawTime}+07:00`;

    const closeMs = new Date(closeISO).getTime();
    const drawMs = new Date(drawISO).getTime();

    // Client chỉ đảm bảo thứ tự cơ bản — server validate buffer chính xác
    if (!isNaN(closeMs) && !isNaN(drawMs) && drawMs <= closeMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["drawTime"],
        message: "Giờ quay số phải sau giờ đóng bán",
      });
    }
  });

/** Inferred type từ editScheduleSchema. */
export type EditScheduleInput = z.infer<typeof editScheduleSchema>;

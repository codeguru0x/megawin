/**
 * Keno – Zod Schemas
 *
 * Reusable validation schemas cho game Keno.
 * Dùng chung bởi: API Gateway handler, Next.js web app, agent app…
 *
 * Quy ước:
 * - Số gửi lên API dạng string zero-padded ("01"-"80").
 * - drawId format: "YYYY-MM-DD.NNN"
 * - boards: cách chơi cơ bản (pick 1-10 số)
 * - sideBets: cách chơi bổ sung (Lớn/Nhỏ, Chẵn/Lẻ)
 */

import { z } from "zod";
import { KENO_DRAW_COUNT, KENO_NUMBER_MIN, KENO_NUMBER_MAX } from "../entities/types";

// ─── Atomic schemas ───

export const kenoNumberSchema = z
  .string()
  .regex(/^(0[1-9]|[1-7][0-9]|80)$/, "Số Keno phải từ '01' đến '80'");

export const kenoDrawIdSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}\.\d{3}$/, "Format: YYYY-MM-DD.NNN");

// ─── Publish Result ────────────────────────────────────────────────────────────

/**
 * Schema validate 20 số trúng kỳ quay Keno.
 *
 * Dùng chung bởi: PublishResultAction (client form) và API route handler.
 * - Mỗi số phải là integer trong [KENO_NUMBER_MIN, KENO_NUMBER_MAX]
 * - Đúng KENO_DRAW_COUNT phần tử
 * - Tất cả phải khác nhau (không trùng lặp)
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
 * Cross-field rules (superRefine):
 * - salesCloseAt > salesOpenAt
 * - drawAt ≥ salesCloseAt + 2 phút (Keno chu kỳ ngắn 8 phút)
 *
 * Mỗi datetime tách thành date + time để map với 2 input riêng trên UI.
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
    const openISO = `${data.salesOpenDate}T${data.salesOpenTime}:00+07:00`;
    const closeISO = `${data.salesCloseDate}T${data.salesCloseTime}:00+07:00`;
    const drawISO = `${data.drawDate}T${data.drawTime}:00+07:00`;

    const openMs = new Date(openISO).getTime();
    const closeMs = new Date(closeISO).getTime();
    const drawMs = new Date(drawISO).getTime();

    if (!isNaN(openMs) && !isNaN(closeMs) && closeMs <= openMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["salesCloseTime"],
        message: "Giờ đóng bán phải sau giờ mở bán",
      });
    }

    // Keno: buffer tối thiểu 2 phút giữa đóng bán và quay số (chu kỳ ngắn 8 phút)
    if (!isNaN(closeMs) && !isNaN(drawMs) && drawMs - closeMs < 2 * 60_000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["drawTime"],
        message: "Giờ quay số phải sau giờ đóng bán ít nhất 2 phút",
      });
    }
  });

/** Inferred type từ editScheduleSchema. */
export type EditScheduleInput = z.infer<typeof editScheduleSchema>;

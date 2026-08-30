/**
 * Lotto 5/35 – Zod Schemas
 *
 * Reusable validation schemas cho game Lotto 5/35.
 * Dùng chung bởi: API Gateway handler, Next.js web app, agent app…
 *
 * Quy ước:
 * - Số gửi lên API dạng string zero-padded ("01"-"35"), parse sang number ở caller.
 * - drawId format: "YYYY-MM-DD.NNN"
 * - boardNo: A-E (tối đa 5 boards)
 */

import { z } from "zod";

import {
  LOTTO535_MAIN_COUNT,
  LOTTO535_MAIN_MAX,
  LOTTO535_MAIN_MIN,
  LOTTO535_SPECIAL_MAX,
  LOTTO535_SPECIAL_MIN,
} from "../entities/types";

/**
 * Trần rộng (sanity ceiling) cho số kỳ tối đa trong 1 lần tạo — dùng chung giữa Zod schema
 * route (`createDrawSchema.draws`, `previewDrawsSchema.count`) và input UI
 * (`create-draw-action.tsx`) để tránh lệch giá trị giữa 2 nơi.
 *
 * Lotto 5/35 quay 1 kỳ/ngày nên trần đủ cho ~2 tuần/lần tạo. KHÔNG phải giới hạn nghiệp
 * vụ thật — giới hạn thật do use-case tính lại theo GlobalConfig tại thời điểm tạo. Hằng
 * số này chỉ chặn input vô lý (batch quá khổ).
 */
export const LOTTO535_CREATE_DRAW_BATCH_MAX = 12;

// ─── Atomic schemas ───

export const lotto535MainNumberSchema = z
  .string()
  .regex(/^(0[1-9]|[12][0-9]|3[0-5])$/, "Số chính phải từ '01' đến '35'");

export const lotto535SpecialNumberSchema = z.string().regex(/^(0[1-9]|1[0-2])$/, "Số đặc biệt phải từ '01' đến '12'");

export const lotto535DrawIdSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}\.\d{3}$/, "Format: YYYY-MM-DD.NNN");

// ─── Publish Result ────────────────────────────────────────────────────────────

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * Schema validate kết quả kỳ quay Lotto 5/35.
 *
 * Dùng chung bởi: PublishResultAction (client form) và API route handler.
 * - winningMain: LOTTO535_MAIN_COUNT số chính, mỗi số trong [MAIN_MIN, MAIN_MAX], không trùng
 * - winningSpecial: 1 số đặc biệt trong [SPECIAL_MIN, SPECIAL_MAX]
 */
export const publishResultSchema = z.object({
  winningMain: z
    .array(
      z
        .string()
        .min(1, "Chưa nhập số")
        .refine(
          (v) => {
            const n = Number(v);
            return Number.isInteger(n) && n >= LOTTO535_MAIN_MIN && n <= LOTTO535_MAIN_MAX;
          },
          `Số chính phải từ ${pad2(LOTTO535_MAIN_MIN)} đến ${pad2(LOTTO535_MAIN_MAX)}`,
        ),
    )
    .length(LOTTO535_MAIN_COUNT, `Cần đúng ${LOTTO535_MAIN_COUNT} số chính`)
    .refine((nums) => new Set(nums.map(Number)).size === LOTTO535_MAIN_COUNT, "Các số chính phải khác nhau"),
  winningSpecial: z
    .string()
    .min(1, "Chưa nhập số đặc biệt")
    .refine(
      (v) => {
        const n = Number(v);
        return Number.isInteger(n) && n >= LOTTO535_SPECIAL_MIN && n <= LOTTO535_SPECIAL_MAX;
      },
      `Số đặc biệt phải từ ${pad2(LOTTO535_SPECIAL_MIN)} đến ${pad2(LOTTO535_SPECIAL_MAX)}`,
    ),
});

/** Inferred type từ publishResultSchema. */
export type PublishResultInput = z.infer<typeof publishResultSchema>;

// ─── Edit Schedule ─────────────────────────────────────────────────────────────

/**
 * Schema validate form sửa lịch kỳ quay Lotto 5/35.
 *
 * Cross-field rules (superRefine):
 * - salesCloseAt > salesOpenAt
 * - drawAt > salesCloseAt (lịch quay phải sau khi đóng bán)
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
        code: "custom",
        path: ["salesCloseTime"],
        message: "Giờ đóng bán phải sau giờ mở bán",
      });
    }

    if (!isNaN(closeMs) && !isNaN(drawMs) && drawMs <= closeMs) {
      ctx.addIssue({
        code: "custom",
        path: ["drawTime"],
        message: "Giờ quay số phải sau giờ đóng bán",
      });
    }
  });

/** Inferred type từ editScheduleSchema. */
export type EditScheduleInput = z.infer<typeof editScheduleSchema>;

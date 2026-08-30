/**
 * Mega 6/45 – Zod Schemas (Input Validation)
 *
 * Dùng để validate input tại API layer (place-bet, config update, v.v.).
 * Không dùng trong business logic layer — chỉ dùng tại boundary (API handler, DTO).
 */

import { DRAW_ID_REGEX } from "@megawin/shared/constants";
import { z } from "zod";

import { MEGA645_NUMBER_COUNT, MEGA645_NUMBER_MAX, MEGA645_NUMBER_MIN } from "../entities/types";

/**
 * Trần rộng (sanity ceiling) cho số kỳ tối đa trong 1 lần tạo — dùng chung giữa Zod schema
 * route (`createDrawSchema.draws`, `previewDrawsSchema.count`) và input UI
 * (`create-draw-action.tsx`) để tránh lệch giá trị giữa 2 nơi.
 *
 * Mega 6/45 quay 1 kỳ/ngày nên trần đủ cho ~2 tuần/lần tạo. KHÔNG phải giới hạn nghiệp vụ
 * thật — giới hạn thật do use-case tính lại theo GlobalConfig tại thời điểm tạo. Hằng số
 * này chỉ chặn input vô lý (batch quá khổ).
 */
export const MEGA645_CREATE_DRAW_BATCH_MAX = 12;

/**
 * Schema validate 1 số chính Mega 6/45.
 * Số hợp lệ: "01"-"45" (string 2 ký tự, zero-padded).
 * Regex bắt: 01-09, 10-39, 40-45.
 */
export const mega645NumberSchema = z.string().regex(/^(0[1-9]|[1-3][0-9]|4[0-5])$/, "Số phải từ '01' đến '45'");

/**
 * Schema validate Draw ID Mega 6/45.
 * Format: "YYYY-MM-DD.NNN" (NNN = drawNo 3 chữ số).
 * Mega 6/45 luôn NNN = 001 (1 kỳ/ngày).
 * DRAW_ID_REGEX được share từ @megawin/shared để đồng bộ với các game khác.
 */
export const mega645DrawIdSchema = z.string().regex(DRAW_ID_REGEX, "Format: YYYY-MM-DD.NNN");

// ─── Publish Result ────────────────────────────────────────────────────────────

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * Schema validate kết quả kỳ quay Mega 6/45.
 *
 * Dùng chung bởi: PublishResultAction (client form) và API route handler.
 * - winningNumbers: MEGA645_NUMBER_COUNT số, mỗi số trong [MEGA645_NUMBER_MIN, MEGA645_NUMBER_MAX], không trùng
 * - Mega 6/45 không có số đặc biệt (khác Lotto 5/35)
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
            return Number.isInteger(n) && n >= MEGA645_NUMBER_MIN && n <= MEGA645_NUMBER_MAX;
          },
          `Số chính phải từ ${pad2(MEGA645_NUMBER_MIN)} đến ${pad2(MEGA645_NUMBER_MAX)}`,
        ),
    )
    .length(MEGA645_NUMBER_COUNT, `Cần đúng ${MEGA645_NUMBER_COUNT} số chính`)
    .refine((nums) => new Set(nums.map(Number)).size === MEGA645_NUMBER_COUNT, "Các số phải khác nhau"),
});

/** Inferred type từ publishResultSchema. */
export type PublishResultInput = z.infer<typeof publishResultSchema>;

// ─── Edit Schedule ─────────────────────────────────────────────────────────────

/**
 * Schema validate form sửa lịch kỳ quay Mega 6/45.
 *
 * Cross-field rules (superRefine):
 * - salesCloseAt > salesOpenAt
 * - drawAt > salesCloseAt (lịch quay phải sau khi đóng bán)
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

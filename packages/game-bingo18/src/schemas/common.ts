/**
 * Bingo 18 – Zod Schemas
 */

import { z } from "zod";

export const bingo18NumberSchema = z.number().int().min(1).max(6, "Số Bingo 18 phải từ 1 đến 6");

export const bingo18SumSchema = z.number().int().min(3).max(18, "Tổng phải từ 3 đến 18");

export const bingo18DrawIdSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}\.\d{3}$/, "Format: YYYY-MM-DD.NNN");

// ─── Edit Schedule ─────────────────────────────────────────────────────────────

/**
 * Schema validate form sửa lịch kỳ quay Bingo 18.
 *
 * Client chỉ validate rule cơ bản: salesCloseAt < drawAt.
 * Buffer chính xác (salesCloseBeforeSeconds) do server validate dựa trên game config
 * tại thời điểm request — tránh out-of-sync khi staff thay đổi config.
 *
 * Time format: "HH:mm:ss" — Bingo 18 chu kỳ 6 phút, cần độ chính xác đến giây.
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

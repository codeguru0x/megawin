/**
 * Power 6/55 – Zod Schemas (API Boundary Validation)
 *
 * Các schema dùng để validate input tại tầng API (route handlers, place-bet, config update).
 * CHỈ dùng cho validation — business logic dùng TypeScript types từ entities/.
 *
 * Quy tắc:
 * - Schema validate format + range, KHÔNG chứa business logic.
 * - Parse thành plain object → truyền vào use case layer.
 * - Nếu cần thêm validation phức tạp hơn (ví dụ: kiểm tra N số cho Bao type),
 *   đặt trong use case hoặc rules/, không ở đây.
 */

import { z } from "zod";
import { POWER655_MAIN_MIN, POWER655_MAIN_MAX, POWER655_MAIN_COUNT } from "../entities/types";

/**
 * Board labels hợp lệ cho Power 6/55.
 * Tối đa 5 boards: A, B, C, D, E (khác Mega 6/45 có 6 boards A-F).
 */
export const VALID_BOARD_NOS = ["A", "B", "C", "D", "E"] as const;

/**
 * Schema validate số chính Power 6/55.
 * Format: chuỗi 2 ký tự zero-padded, phạm vi "01"-"55".
 * Regex: 01-09 → 0[1-9], 10-49 → [1-4][0-9], 50-55 → 5[0-5].
 *
 * Tập số 01-55 (55 quả bóng) — khác Mega 6/45 (01-45).
 */
export const power655MainNumberSchema = z
  .string()
  .regex(/^(0[1-9]|[1-4][0-9]|5[0-5])$/, "Số chính phải từ '01' đến '55'");

/**
 * Schema validate draw ID Power 6/55.
 * Format: "YYYY-MM-DD.NNN" — ngày quay + số thứ tự kỳ (3 chữ số zero-padded).
 * Ví dụ: "2026-03-10.001" (kỳ quay ngày 10/03/2026, kỳ số 1).
 *
 * Lưu ý: schema chỉ validate format, KHÔNG kiểm tra ngày có phải ngày quay hợp lệ
 * (T3, T5, T7) — business rule đó nằm trong use case layer.
 */
export const power655DrawIdSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}\.\d{3}$/, "Format: YYYY-MM-DD.NNN");

// ─── Publish Result ────────────────────────────────────────────────────────────

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * Schema validate kết quả kỳ quay Power 6/55.
 *
 * Dùng chung bởi: PublishResultAction (client form) và API route handler.
 * - winningMain: POWER655_MAIN_COUNT số chính, trong [MAIN_MIN, MAIN_MAX], không trùng
 * - bonusNumber: 1 số thưởng trong [MAIN_MIN, MAIN_MAX], phải khác tất cả 6 số chính
 *   (bonus quay từ 49 quả còn lại sau khi rút 6 chính → không thể trùng)
 */
export const publishResultSchema = z
  .object({
    winningMain: z
      .array(
        z
          .string()
          .min(1, "Chưa nhập số")
          .refine(
            (v) => {
              const n = Number(v);
              return Number.isInteger(n) && n >= POWER655_MAIN_MIN && n <= POWER655_MAIN_MAX;
            },
            `Số chính phải từ ${pad2(POWER655_MAIN_MIN)} đến ${pad2(POWER655_MAIN_MAX)}`,
          ),
      )
      .length(POWER655_MAIN_COUNT, `Cần đúng ${POWER655_MAIN_COUNT} số chính`)
      .refine((nums) => new Set(nums.map(Number)).size === POWER655_MAIN_COUNT, "Các số chính phải khác nhau"),
    bonusNumber: z
      .string()
      .min(1, "Chưa nhập số thưởng")
      .refine(
        (v) => {
          const n = Number(v);
          return Number.isInteger(n) && n >= POWER655_MAIN_MIN && n <= POWER655_MAIN_MAX;
        },
        `Số thưởng phải từ ${pad2(POWER655_MAIN_MIN)} đến ${pad2(POWER655_MAIN_MAX)}`,
      ),
  })
  .superRefine((data, ctx) => {
    // Bonus number quay từ 49 quả còn lại → không được trùng với 6 số chính
    const mainSet = new Set(data.winningMain.map(Number));
    const bonus = Number(data.bonusNumber);
    if (!isNaN(bonus) && mainSet.has(bonus)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["bonusNumber"],
        message: "Số thưởng phải khác tất cả 6 số chính",
      });
    }
  });

/** Inferred type từ publishResultSchema. */
export type PublishResultInput = z.infer<typeof publishResultSchema>;

// ─── Edit Schedule ─────────────────────────────────────────────────────────────

/**
 * Schema validate form sửa lịch kỳ quay Power 6/55.
 *
 * Cross-field rules (superRefine):
 * - salesCloseAt > salesOpenAt
 * - drawAt ≥ salesCloseAt + 5 phút (buffer tối thiểu cho Power 6/55)
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

    // Power 6/55: buffer tối thiểu 5 phút giữa đóng bán và quay số
    if (!isNaN(closeMs) && !isNaN(drawMs) && drawMs - closeMs < 5 * 60_000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["drawTime"],
        message: "Giờ quay số phải sau giờ đóng bán ít nhất 5 phút",
      });
    }
  });

/** Inferred type từ editScheduleSchema. */
export type EditScheduleInput = z.infer<typeof editScheduleSchema>;

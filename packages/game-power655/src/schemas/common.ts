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
export const power655DrawIdSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}\.\d{3}$/, "Format: YYYY-MM-DD.NNN");

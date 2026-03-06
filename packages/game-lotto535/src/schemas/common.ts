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

// ─── Atomic schemas ───

export const VALID_BOARD_NOS = ["A", "B", "C", "D", "E"] as const;

export const lotto535MainNumberSchema = z
  .string()
  .regex(/^(0[1-9]|[12][0-9]|3[0-5])$/, "Số chính phải từ '01' đến '35'");

export const lotto535SpecialNumberSchema = z
  .string()
  .regex(/^(0[1-9]|1[0-2])$/, "Số đặc biệt phải từ '01' đến '12'");

export const lotto535DrawIdSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}\.\d{3}$/, "Format: YYYY-MM-DD.NNN");

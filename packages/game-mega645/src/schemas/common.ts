/**
 * Mega 6/45 – Zod Schemas (Input Validation)
 *
 * Dùng để validate input tại API layer (place-bet, config update, v.v.).
 * Không dùng trong business logic layer — chỉ dùng tại boundary (API handler, DTO).
 */

import { z } from "zod";
import { DRAW_ID_REGEX } from "@megawin/shared/constants/validation";

/** Board nos hợp lệ cho Mega 6/45: tối đa 6 boards, ký hiệu A-F. */
export const VALID_BOARD_NOS = ["A", "B", "C", "D", "E", "F"] as const;

/**
 * Schema validate 1 số chính Mega 6/45.
 * Số hợp lệ: "01"-"45" (string 2 ký tự, zero-padded).
 * Regex bắt: 01-09, 10-39, 40-45.
 */
export const mega645MainNumberSchema = z
  .string()
  .regex(/^(0[1-9]|[1-3][0-9]|4[0-5])$/, "Số phải từ '01' đến '45'");

/**
 * Schema validate Draw ID Mega 6/45.
 * Format: "YYYY-MM-DD.NNN" (NNN = drawNo 3 chữ số).
 * Mega 6/45 luôn NNN = 001 (1 kỳ/ngày).
 * DRAW_ID_REGEX được share từ @megawin/shared để đồng bộ với các game khác.
 */
export const mega645DrawIdSchema = z.string().regex(DRAW_ID_REGEX, "Format: YYYY-MM-DD.NNN");

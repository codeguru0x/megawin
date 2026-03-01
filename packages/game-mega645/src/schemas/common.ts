/**
 * Mega 6/45 – Zod Schemas
 */

import { z } from "zod";

export const VALID_BOARD_NOS = ["A", "B", "C", "D", "E", "F"] as const;

export const mega645MainNumberSchema = z
  .string()
  .regex(/^(0[1-9]|[1-3][0-9]|4[0-5])$/, "Số phải từ '01' đến '45'");

export const mega645DrawIdSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}\.\d{3}$/, "Format: YYYY-MM-DD.NNN");

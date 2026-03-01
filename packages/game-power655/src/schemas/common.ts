/**
 * Power 6/55 – Zod Schemas
 */

import { z } from "zod";

export const VALID_BOARD_NOS = ["A", "B", "C", "D", "E"] as const;

export const power655MainNumberSchema = z
  .string()
  .regex(/^(0[1-9]|[1-4][0-9]|5[0-5])$/, "Số chính phải từ '01' đến '55'");

export const power655DrawIdSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}\.\d{3}$/, "Format: YYYY-MM-DD.NNN");

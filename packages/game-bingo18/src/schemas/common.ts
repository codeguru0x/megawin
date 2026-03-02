/**
 * Bingo 18 – Zod Schemas
 */

import { z } from "zod";

export const bingo18NumberSchema = z
  .number()
  .int()
  .min(1)
  .max(6, "Số Bingo 18 phải từ 1 đến 6");

export const bingo18SumSchema = z
  .number()
  .int()
  .min(3)
  .max(18, "Tổng phải từ 3 đến 18");

export const bingo18DrawIdSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}\.\d{3}$/, "Format: YYYY-MM-DD.NNN");

/**
 * Max 3D – Zod Schemas
 *
 * Bộ ba số: "000"-"999" (3 chữ số zero-padded).
 * DrawId: "YYYY-MM-DD.NNN"
 */

import { z } from "zod";

export const VALID_BOARD_NOS = ["A", "B", "C", "D"] as const;

export const max3dTripletSchema = z
  .string()
  .regex(/^\d{3}$/, "Bộ ba số phải gồm 3 chữ số (000-999)");

export const max3dDrawIdSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}\.\d{3}$/, "Format: YYYY-MM-DD.NNN");

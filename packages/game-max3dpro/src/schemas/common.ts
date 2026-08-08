/**
 * Max 3D Pro – Zod Schemas
 *
 * Bộ ba số: "000"-"999" (3 chữ số zero-padded).
 * DrawId: "YYYY-MM-DD.NNN"
 */

import { z } from "zod";

export const VALID_BOARD_NOS = ["A", "B", "C", "D"] as const;

export const max3dproTripletSchema = z.string().regex(/^\d{3}$/, "Bộ ba số phải gồm 3 chữ số (000-999)");

export const max3dproDrawIdSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}\.\d{3}$/, "Format: YYYY-MM-DD.NNN");

export const max3dproDigitSchema = z.number().int().min(0).max(9, "Chữ số phải từ 0-9");

import { z } from "zod";

/**
 * Schema chung cho các endpoints operations dashboard Keno.
 * Hỗ trợ lọc theo financialDate hoặc drawId.
 */
export const opsQuerySchema = z.object({
  financialDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "financialDate phải là YYYY-MM-DD.")
    .optional(),
  drawId: z.string().optional(),
});

/**
 * Schema cho live-entries — cần drawId bắt buộc + limit optional.
 */
export const liveEntriesQuerySchema = z.object({
  drawId: z.string().min(1, "drawId là bắt buộc."),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

/**
 * Schema cho top-combos — cần drawId bắt buộc + limit optional.
 */
export const topCombosQuerySchema = z.object({
  drawId: z.string().min(1, "drawId là bắt buộc."),
  limit: z.coerce.number().int().min(1).max(20).optional(),
});

/**
 * Schema cho winning-entries — cần drawId bắt buộc + cursor pagination.
 */
export const winningEntriesQuerySchema = z.object({
  drawId: z.string().min(1, "drawId là bắt buộc."),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

import { z } from "zod";

/**
 * Schema chung cho các endpoints operations dashboard Mega 6/45.
 * Hỗ trợ lọc theo financialDate hoặc drawId.
 */
export const opsQuerySchema = z.object({
  financialDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "financialDate phải là YYYY-MM-DD.")
    .optional(),
  drawId: z.string().optional(),
});

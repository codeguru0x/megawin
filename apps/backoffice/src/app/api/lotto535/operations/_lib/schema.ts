import { z } from "zod";

export const opsQuerySchema = z.object({
  financialDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "financialDate phải là YYYY-MM-DD.")
    .optional(),
  drawId: z.string().optional(),
});

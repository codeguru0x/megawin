import { z } from "zod";
import { DRAW_STATUS_VALUES } from "@megawin/game-core/entities";

export const createDrawSchema = z.object({
  count: z.coerce.number().int().min(1).max(12).default(2),
});

export const previewDrawsSchema = z.object({
  count: z.coerce.number().int().min(1).max(12).default(2),
});

export const listDrawsQuerySchema = z.object({
  status: z
    .enum(DRAW_STATUS_VALUES as [string, ...string[]])
    .optional(),
  fromDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "fromDate phải là YYYY-MM-DD.")
    .optional(),
  toDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "toDate phải là YYYY-MM-DD.")
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(100).default(20),
});

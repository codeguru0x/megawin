import { z } from "zod";

export const opsQuerySchema = z.object({
  financialDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "financialDate phải là YYYY-MM-DD.")
    .optional(),
  drawId: z.string().optional(),
});

export const liveEntriesQuerySchema = z.object({
  drawId: z.string().min(1, "drawId là bắt buộc."),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const topCombosQuerySchema = z.object({
  drawId: z.string().min(1, "drawId là bắt buộc."),
  limit: z.coerce.number().int().min(1).max(20).optional(),
});

export const winningEntriesQuerySchema = z.object({
  drawId: z.string().min(1, "drawId là bắt buộc."),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const tripletFrequencyQuerySchema = z.object({
  financialDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "financialDate phải là YYYY-MM-DD.")
    .optional(),
  drawId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

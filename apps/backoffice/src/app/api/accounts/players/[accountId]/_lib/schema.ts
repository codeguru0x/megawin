import { z } from "zod";

export const playerOverviewQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "from phải là YYYY-MM-DD"),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "to phải là YYYY-MM-DD"),
});

export const playerFinancialsQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "from phải là YYYY-MM-DD"),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "to phải là YYYY-MM-DD"),
  game: z.string().optional(),
});

export const playerEntriesQuerySchema = z.object({
  financialDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "financialDate phải là YYYY-MM-DD"),
  game: z.string().min(1, "game là bắt buộc"),
  drawId: z.string().optional(),
});

export const playerDrawBreakdownQuerySchema = z.object({
  financialDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "financialDate phải là YYYY-MM-DD"),
  game: z.string().min(1, "game là bắt buộc"),
});

export const playerEntryDetailQuerySchema = z.object({
  game: z.string().min(1, "game là bắt buộc"),
});

import { z } from "zod";
import { Pagination } from "@megawin/shared/constants";

export const jackpotCyclesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(Pagination.Default.Page),
  size: z.coerce.number().int().min(1).max(Pagination.Max.Size).default(Pagination.Default.Size),
});

export const jackpotHistoryByCycleQuerySchema = z.object({
  cycleNo: z.coerce.number().int().min(1),
  page: z.coerce.number().int().min(1).default(Pagination.Default.Page),
  size: z.coerce.number().int().min(1).max(Pagination.Max.Size).default(Pagination.Default.Size),
});

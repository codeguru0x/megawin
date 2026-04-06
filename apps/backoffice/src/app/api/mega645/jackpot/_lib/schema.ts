import { z } from "zod";
import { Pagination } from "@megawin/shared/constants";

export const jackpotCyclesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(Pagination.Max.Page).default(Pagination.Default.Page),
  size: z.coerce.number().int().min(1).max(Pagination.Max.Size).default(Pagination.Default.Size),
});

/** Query schema cho history-by-cycle — cycleNo=0 map sang active cycle (null). */
export const jackpotHistoryByCycleQuerySchema = z.object({
  /** cycleNo = 0 → active cycle. cycleNo > 0 → cycle cụ thể. */
  cycleNo: z.coerce.number().int().min(0).default(0),
  page: z.coerce.number().int().min(1).max(Pagination.Max.Page).default(Pagination.Default.Page),
  size: z.coerce.number().int().min(1).max(Pagination.Max.Size).default(Pagination.Default.Size),
});

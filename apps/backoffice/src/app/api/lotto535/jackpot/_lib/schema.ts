import { Pagination } from "@megawin/shared/constants";
import { z } from "zod";

export const jackpotCyclesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(Pagination.Default.Page),
  size: z.coerce.number().int().min(1).max(Pagination.Max.Size).default(Pagination.Default.Size),
});

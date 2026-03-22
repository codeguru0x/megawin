import { z } from "zod";

/** Query params cho GET /api/accounts/players/search */
export const searchPlayerQuerySchema = z.object({
  keyword: z.string().min(1, "keyword là bắt buộc.").max(100),
});

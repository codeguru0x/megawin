import { z } from "zod";

/** Query params cho GET /api/accounts/players */
export const listPlayersQuerySchema = z.object({
  tenantId: z.string().min(1, "tenantId là bắt buộc."),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

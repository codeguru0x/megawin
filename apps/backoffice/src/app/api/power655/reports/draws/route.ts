import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { ListSettleDrawReportsUseCase } from "@megawin/game-power655-application/use-cases/reports";
import { z } from "zod";

const querySchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

const useCase = new ListSettleDrawReportsUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(querySchema)
  .handler(async ({ query }) => useCase.run(query));

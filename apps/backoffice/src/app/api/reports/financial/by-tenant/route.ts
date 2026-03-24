import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { GetTenantSummaryUseCase } from "@megawin/game-core-application/use-cases/reports";
import { z } from "zod";

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  game: z.string().optional(),
  tenantId: z.string().optional(),
});

const useCase = new GetTenantSummaryUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(querySchema)
  .handler(async ({ query }) => useCase.run(query));

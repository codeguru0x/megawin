import { ListTenantReportsUseCase } from "@megawin/game-bingo18-application/use-cases/reports";
import { CompanyRole } from "@megawin/identity/entities";
import { z } from "zod";

import { withApi } from "@/lib/api";

const querySchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});

const useCase = new ListTenantReportsUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(querySchema)
  .handler(async ({ query }) => useCase.run(query));

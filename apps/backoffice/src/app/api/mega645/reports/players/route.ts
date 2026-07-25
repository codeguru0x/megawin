import { ListPlayerBreakdownUseCase } from "@megawin/game-mega645-application/use-cases/reports";
import { CompanyRole } from "@megawin/identity/entities";
import { z } from "zod";

import { withApi } from "@/lib/api";

const querySchema = z.object({
  drawId: z.string().min(1),
  tenantId: z.string().min(1),
});

const useCase = new ListPlayerBreakdownUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(querySchema)
  .handler(async ({ query }) => useCase.run(query));

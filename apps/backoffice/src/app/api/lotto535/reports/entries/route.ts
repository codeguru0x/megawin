import { ListEntryBreakdownUseCase } from "@megawin/game-lotto535-application/use-cases/reports";
import { CompanyRole } from "@megawin/identity/entities";
import { z } from "zod";

import { withApi } from "@/lib/api";

const querySchema = z.object({
  drawId: z.string().min(1),
  tenantId: z.string().min(1),
  accountId: z.string().min(1),
});

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(querySchema)
  .handler(async ({ query }) => new ListEntryBreakdownUseCase().run(query));

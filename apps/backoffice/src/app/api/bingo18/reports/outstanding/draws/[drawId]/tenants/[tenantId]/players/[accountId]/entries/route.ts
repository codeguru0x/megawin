import { ListOutstandingPlayerEntriesUseCase } from "@megawin/game-bingo18-application/use-cases/reports";
import { CompanyRole } from "@megawin/identity/entities";
import { z } from "zod";

import { withApi } from "@/lib/api";

const useCase = new ListOutstandingPlayerEntriesUseCase();

const paramsSchema = z.object({
  accountId: z.string().min(1),
  drawId: z.string().min(1),
  tenantId: z.string().min(1),
});
export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .params(paramsSchema)
  .handler(async ({ params }) => {
    const { drawId, tenantId, accountId } = params;
    return useCase.run({ drawId, tenantId, accountId });
  });

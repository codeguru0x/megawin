import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities/account";
import { ListEntryBreakdownUseCase } from "@megawin/game-max3d-application/use-cases/reports";
import { z } from "zod";

const querySchema = z.object({
  drawId: z.string().min(1),
  tenantId: z.string().min(1),
  accountId: z.string().min(1),
});

const useCase = new ListEntryBreakdownUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(querySchema)
  .handler(async ({ query }) => useCase.run(query));

import { ListTenantDrawsUseCase } from "@megawin/game-max3dpro-application/use-cases/reports";
import { CompanyRole } from "@megawin/identity/entities";
import { z } from "zod";

import { withApi } from "@/lib/api";

const querySchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

const useCase = new ListTenantDrawsUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(querySchema)
  .handler(async ({ query, params }) => {
    const tenantId = (await params).tenantId as string;
    return useCase.run({ ...query, tenantId });
  });

import { ListTenantDrawsUseCase } from "@megawin/game-lotto535-application/use-cases/reports";
import { CompanyRole } from "@megawin/identity/entities";
import { z } from "zod";

import { withApi } from "@/lib/api";

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(querySchema)
  .handler(async ({ query, params }) => {
    const tenantId = (await params).tenantId as string;
    return new ListTenantDrawsUseCase().run({ ...query, tenantId });
  });

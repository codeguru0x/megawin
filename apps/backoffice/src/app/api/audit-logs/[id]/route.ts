import { GetAuditLogUseCase } from "@megawin/audit/use-cases";
import { CompanyRole } from "@megawin/identity/entities";
import { z } from "zod";

import { withApi } from "@/lib/api";

const useCase = new GetAuditLogUseCase();

const paramsSchema = z.object({
  id: z.string().min(1),
});
export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .params(paramsSchema)
  .handler(async ({ params }) => {
    const { id } = params;
    return useCase.run({ id });
  });

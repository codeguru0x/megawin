import { GetAuditLogUseCase } from "@megawin/audit/use-cases";
import { CompanyRole } from "@megawin/identity/entities";

import { withApi } from "@/lib/api";

const useCase = new GetAuditLogUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async ({ params }) => {
    const { id } = params as { id: string };
    return useCase.run({ id });
  });

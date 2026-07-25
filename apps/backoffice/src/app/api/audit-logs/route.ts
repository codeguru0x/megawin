import { ListAuditLogsUseCase } from "@megawin/audit/use-cases";
import { CompanyRole } from "@megawin/identity/entities";

import { withApi } from "@/lib/api";

import { listAuditLogsQuerySchema } from "./_lib/schema";

const useCase = new ListAuditLogsUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(listAuditLogsQuerySchema)
  .handler(async ({ query }) => useCase.run(query));

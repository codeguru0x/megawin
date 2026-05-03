import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { ListTxLogsUseCase } from "@megawin/tenant-gateway/use-cases/tx-logs";

import { listTxLogsQuerySchema } from "./_lib/schema";

const useCase = new ListTxLogsUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(listTxLogsQuerySchema)
  .handler(async ({ query }) => useCase.run(query));

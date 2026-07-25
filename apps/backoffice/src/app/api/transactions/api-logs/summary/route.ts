import { CompanyRole } from "@megawin/identity/entities";
import { GetTxLogsSummaryUseCase } from "@megawin/tenant-gateway/use-cases/tx-logs";

import { withApi } from "@/lib/api";

import { txLogsSummaryQuerySchema } from "../_lib/schema";

const useCase = new GetTxLogsSummaryUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(txLogsSummaryQuerySchema)
  .handler(async ({ query }) => useCase.run(query));

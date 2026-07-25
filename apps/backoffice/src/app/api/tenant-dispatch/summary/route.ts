import { CompanyRole } from "@megawin/identity/entities";
import { GetDispatchSummaryUseCase } from "@megawin/tenant-dispatch/use-cases/admin";

import { withApi } from "@/lib/api";

import { dispatchSummaryQuerySchema } from "../_lib/schema";

const useCase = new GetDispatchSummaryUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(dispatchSummaryQuerySchema)
  .handler(async ({ query }) => useCase.run(query));

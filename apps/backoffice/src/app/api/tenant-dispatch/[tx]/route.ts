import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { GetOrderByTxUseCase } from "@megawin/tenant-dispatch/use-cases/admin";

import { getDispatchByTxParamsSchema } from "../_lib/schema";

const useCase = new GetOrderByTxUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .params(getDispatchByTxParamsSchema)
  .handler(async ({ params }) => useCase.run({ tx: params.tx }));

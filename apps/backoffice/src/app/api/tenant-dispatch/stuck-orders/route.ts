import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { ListStuckOrdersUseCase } from "@megawin/tenant-dispatch/use-cases/admin";

import { listStuckOrdersQuerySchema } from "../_lib/schema";

const useCase = new ListStuckOrdersUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(listStuckOrdersQuerySchema)
  .handler(async ({ query }) =>
    useCase.run({
      minRetryCount: query.minRetryCount,
      tenantId: query.tenantId,
      limit: query.limit,
      skip: query.skip,
    }),
  );

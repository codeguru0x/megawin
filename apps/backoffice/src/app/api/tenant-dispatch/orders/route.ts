import { CompanyRole } from "@megawin/identity/entities";
import { ListOrdersBySourceUseCase } from "@megawin/tenant-dispatch/use-cases/admin";

import { withApi } from "@/lib/api";

import { listOrdersQuerySchema } from "../_lib/schema";

const useCase = new ListOrdersBySourceUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(listOrdersQuerySchema)
  .handler(async ({ query }) =>
    useCase.run({
      gameId: query.gameId,
      sourceKind: query.sourceKind,
      sourceId: query.sourceId,
      status: query.status,
      limit: query.limit,
      skip: query.skip,
    }),
  );

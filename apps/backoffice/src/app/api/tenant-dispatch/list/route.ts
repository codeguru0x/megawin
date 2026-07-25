import { CompanyRole } from "@megawin/identity/entities";
import { ListDispatchOrdersUseCase } from "@megawin/tenant-dispatch/use-cases/admin";

import { withApi } from "@/lib/api";

import { listDispatchOrdersQuerySchema } from "../_lib/schema";

const useCase = new ListDispatchOrdersUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(listDispatchOrdersQuerySchema)
  .handler(async ({ query }) => useCase.run(query));

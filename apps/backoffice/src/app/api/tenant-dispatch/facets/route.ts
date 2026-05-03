import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { GetDispatchFacetsUseCase } from "@megawin/tenant-dispatch/use-cases/admin";

import { dispatchFacetsQuerySchema } from "../_lib/schema";

const useCase = new GetDispatchFacetsUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(dispatchFacetsQuerySchema)
  .handler(async ({ query }) => useCase.run(query));

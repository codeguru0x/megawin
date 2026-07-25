import { CompanyRole } from "@megawin/identity/entities";
import { UpdateTenantStatusUseCase } from "@megawin/identity-application/use-cases/tenants";

import { withApi } from "@/lib/api";

import { updateTenantStatusSchema } from "../_lib/schema";

export const PATCH = withApi()
  .auth({ roles: [CompanyRole.Admin] })
  .body(updateTenantStatusSchema)
  .handler(async ({ body }) => {
    const useCase = new UpdateTenantStatusUseCase();
    return useCase.run(body);
  });

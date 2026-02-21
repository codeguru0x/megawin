import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity-domain/accounts/account";
import { UpdateTenantStatusUseCase } from "@megawin/identity-application/use-cases/tenants";

import { updateTenantStatusSchema } from "../_lib/schema";

export const PATCH = withApi()
  .auth({ roles: [CompanyRole.Admin] })
  .body(updateTenantStatusSchema)
  .handler(async ({ body }) => {
    const useCase = new UpdateTenantStatusUseCase();
    return useCase.run(body);
  });

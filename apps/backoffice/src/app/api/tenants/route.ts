import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import {
  CreateTenantUseCase,
  ListTenantsUseCase,
  UpdateTenantUseCase,
} from "@megawin/identity-application/use-cases/tenants";

import { createTenantSchema, updateTenantSchema } from "./_lib/schema";

export const POST = withApi()
  .auth({ roles: [CompanyRole.Admin] })
  .body(createTenantSchema)
  .handler(async ({ body }) => {
    const useCase = new CreateTenantUseCase();
    return useCase.run(
      {
        tenantId: body.tenantId,
        displayName: body.displayName,
        description: body.description,
        callbackBaseUrl: body.callbackBaseUrl,
      },
      { successStatus: 201 }
    );
  });

export const GET = withApi()
  .auth({ roles: [CompanyRole.Admin] })
  .handler(async () => {
    const useCase = new ListTenantsUseCase();
    return useCase.run();
  });

export const PATCH = withApi()
  .auth({ roles: [CompanyRole.Admin] })
  .body(updateTenantSchema)
  .handler(async ({ body }) => {
    const useCase = new UpdateTenantUseCase();
    return useCase.run(body);
  });

import { CompanyRole } from "@megawin/identity/entities";
import {
  CreateTenantUseCase,
  ListTenantsUseCase,
  UpdateTenantUseCase,
} from "@megawin/identity-application/use-cases/tenants";

import { withApi } from "@/lib/api";

import { createTenantSchema, updateTenantSchema } from "./_lib/schema";

const createTenantUseCase = new CreateTenantUseCase();
const listTenantsUseCase = new ListTenantsUseCase();
const updateTenantUseCase = new UpdateTenantUseCase();

export const POST = withApi()
  .auth({ roles: [CompanyRole.Admin] })
  .body(createTenantSchema)
  .handler(async ({ body }) => {
    return createTenantUseCase.run({
      tenantId: body.tenantId,
      displayName: body.displayName,
      description: body.description,
      callbackBaseUrl: body.callbackBaseUrl,
    });
  });

export const GET = withApi()
  .auth({ roles: [CompanyRole.Admin] })
  .handler(async () => {
    return listTenantsUseCase.run();
  });

export const PATCH = withApi()
  .auth({ roles: [CompanyRole.Admin] })
  .body(updateTenantSchema)
  .handler(async ({ body }) => {
    return updateTenantUseCase.run(body);
  });

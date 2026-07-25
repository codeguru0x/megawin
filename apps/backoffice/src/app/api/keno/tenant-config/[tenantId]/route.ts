import {
  GetTenantConfigUseCase,
  UpdateTenantConfigUseCase,
} from "@megawin/game-keno-application/use-cases/tenant-config";
import { CompanyRole } from "@megawin/identity/entities";

import { withApi } from "@/lib/api";
import { actorFromSession } from "@/lib/audit-actor";

import { tenantIdParamSchema, updateTenantConfigSchema } from "../_lib/schema";

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .params(tenantIdParamSchema)
  .handler(async ({ params }) => {
    const useCase = new GetTenantConfigUseCase();
    return useCase.run({ tenantId: params.tenantId });
  });

export const PUT = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .params(tenantIdParamSchema)
  .body(updateTenantConfigSchema)
  .handler(async ({ params, body, session, request }) => {
    const useCase = new UpdateTenantConfigUseCase();
    return useCase.run({
      tenantId: params.tenantId,
      ...body,
      actor: actorFromSession(session!, request),
    });
  });

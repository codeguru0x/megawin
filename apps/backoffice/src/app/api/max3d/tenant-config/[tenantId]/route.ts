import {
  GetTenantConfigUseCase,
  UpdateTenantConfigUseCase,
} from "@megawin/game-max3d-application/use-cases/tenant-config";
import { CompanyRole } from "@megawin/identity/entities";

import { withApi } from "@/lib/api";
import { actorFromSession } from "@/lib/audit-actor";

import { tenantIdParamSchema, updateTenantConfigSchema } from "../_lib/schema";

const getTenantConfigUseCase = new GetTenantConfigUseCase();
const updateTenantConfigUseCase = new UpdateTenantConfigUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .params(tenantIdParamSchema)
  .handler(async ({ params }) => {
    return getTenantConfigUseCase.run({ tenantId: params.tenantId });
  });

export const PUT = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .params(tenantIdParamSchema)
  .body(updateTenantConfigSchema)
  .handler(async ({ params, body, session, request }) => {
    return updateTenantConfigUseCase.run({
      tenantId: params.tenantId,
      ...body,
      actor: actorFromSession(session!, request),
    });
  });

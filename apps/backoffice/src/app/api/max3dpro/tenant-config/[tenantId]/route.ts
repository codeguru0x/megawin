import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities/account";
import {
  GetTenantConfigUseCase,
  UpdateTenantConfigUseCase,
} from "@megawin/game-max3dpro-application/use-cases/tenant-config";

import { updateTenantConfigSchema } from "../_lib/schema";

const getTenantConfigUseCase = new GetTenantConfigUseCase();
const updateTenantConfigUseCase = new UpdateTenantConfigUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async ({ params }) => {
    const { tenantId } = params as { tenantId: string };
    return getTenantConfigUseCase.run({ tenantId });
  });

export const PUT = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(updateTenantConfigSchema)
  .handler(async ({ params, body }) => {
    const { tenantId } = params as { tenantId: string };
    return updateTenantConfigUseCase.run({ tenantId, ...body });
  });

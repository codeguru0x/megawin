import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities/account";
import {
  GetTenantConfigUseCase,
  UpdateTenantConfigUseCase,
} from "@megawin/game-lotto535-application/use-cases/tenant-config";

import { updateTenantConfigSchema } from "../_lib/schema";

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async ({ params }) => {
    const { tenantId } = params as { tenantId: string };
    const useCase = new GetTenantConfigUseCase();
    return useCase.run({ tenantId });
  });

export const PUT = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(updateTenantConfigSchema)
  .handler(async ({ params, body }) => {
    const { tenantId } = params as { tenantId: string };
    const useCase = new UpdateTenantConfigUseCase();
    return useCase.run({ tenantId, ...body });
  });

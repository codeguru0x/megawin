import { ListTenantConfigsUseCase } from "@megawin/game-keno-application/use-cases/tenant-config";
import { CompanyRole } from "@megawin/identity/entities";

import { withApi } from "@/lib/api";

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async () => {
    const useCase = new ListTenantConfigsUseCase();
    return useCase.run();
  });

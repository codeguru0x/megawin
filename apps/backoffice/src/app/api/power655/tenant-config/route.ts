import { ListTenantConfigsUseCase } from "@megawin/game-power655-application/use-cases/tenant-config";
import { CompanyRole } from "@megawin/identity/entities";

import { withApi } from "@/lib/api";

const listTenantConfigsUseCase = new ListTenantConfigsUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async () => {
    return listTenantConfigsUseCase.run();
  });

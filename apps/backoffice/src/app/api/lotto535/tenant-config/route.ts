import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { ListTenantConfigsUseCase } from "@megawin/game-lotto535-application/use-cases/tenant-config";

const listTenantConfigsUseCase = new ListTenantConfigsUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async () => {
    return listTenantConfigsUseCase.run();
  });

import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities/account";
import { ListTenantConfigsUseCase } from "@megawin/game-mega645-application/use-cases/tenant-config";

const listTenantConfigsUseCase = new ListTenantConfigsUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async () => {
    return listTenantConfigsUseCase.run();
  });

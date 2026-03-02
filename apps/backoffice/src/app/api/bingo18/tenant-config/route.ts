import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities/account";
import { ListTenantConfigsUseCase } from "@megawin/game-bingo18-application/use-cases/tenant-config";

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async () => {
    const useCase = new ListTenantConfigsUseCase();
    return useCase.run();
  });

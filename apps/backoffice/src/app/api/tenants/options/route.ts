import { ListTenantOptionsUseCase } from "@megawin/identity-application/use-cases/tenants";

import { withApi } from "@/lib/api";

export const GET = withApi()
  .auth()
  .handler(async () => {
    const useCase = new ListTenantOptionsUseCase();
    return useCase.run();
  });

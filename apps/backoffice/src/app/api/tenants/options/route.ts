import { withApi } from "@/lib/api";
import { ListTenantOptionsUseCase } from "@megawin/identity-application/use-cases/tenants";

export const GET = withApi()
  .auth()
  .handler(async () => {
    const useCase = new ListTenantOptionsUseCase();
    return useCase.run(undefined as void);
  });

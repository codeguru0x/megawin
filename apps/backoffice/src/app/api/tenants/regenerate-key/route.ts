import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { RegenerateApiKeyUseCase } from "@megawin/identity-application/use-cases/tenants";

import { regenerateApiKeySchema } from "../_lib/schema";

export const POST = withApi()
  .auth({ roles: [CompanyRole.Admin] })
  .body(regenerateApiKeySchema)
  .handler(async ({ body }) => {
    const useCase = new RegenerateApiKeyUseCase();
    return useCase.run(body);
  });

import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities/account";
import {
  CreateAgentAccountUseCase,
  ListAgentAccountsUseCase,
} from "@megawin/identity-application/use-cases/accounts";

import { createAgentSchema } from "./_lib/schema";

export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(createAgentSchema)
  .handler(async ({ body }) => {
    const useCase = new CreateAgentAccountUseCase();
    return useCase.run(body, { successStatus: 201 });
  });

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async () => {
    const useCase = new ListAgentAccountsUseCase();
    return useCase.run(undefined as void);
  });

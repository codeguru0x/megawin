import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity-domain/accounts/account";
import {
  CreateAgentAccountUseCase,
  ListCompanyAccountsUseCase,
} from "@megawin/identity-application/use-cases/accounts";

import { createAgentSchema, listAgentsQuerySchema } from "./_lib/schema";

export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(createAgentSchema)
  .handler(async ({ body }) => {
    const useCase = new CreateAgentAccountUseCase();
    return useCase.run(body, { successStatus: 201 });
  });

export const GET = withApi()
  .auth()
  .query(listAgentsQuerySchema)
  .handler(async ({ query }) => {
    const useCase = new ListCompanyAccountsUseCase();
    return useCase.run({
      limit: query.limit,
      paginationToken: query.paginationToken,
    });
  });

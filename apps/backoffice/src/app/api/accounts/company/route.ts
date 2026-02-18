import { withApi } from "@/lib/api";
import {
  CreateCompanyAccountUseCase,
  ListCompanyAccountsUseCase,
} from "@megawin/identity-application/use-cases/accounts";

import { createAccountSchema, listQuerySchema } from "./_lib/schema";

export const POST = withApi()
  .auth({ roles: ["Admin"] })
  .body(createAccountSchema)
  .handler(async ({ body }) => {
    const useCase = new CreateCompanyAccountUseCase();
    return useCase.run(body, { successStatus: 201 });
  });

export const GET = withApi()
  .auth()
  .query(listQuerySchema)
  .handler(async ({ query }) => {
    const useCase = new ListCompanyAccountsUseCase();
    return useCase.run({
      limit: query.limit,
      paginationToken: query.paginationToken,
    });
  });

import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import {
  CreateCompanyAccountUseCase,
  ListCompanyAccountsUseCase,
  type CreateCompanyAccountInput,
} from "@megawin/identity-application/use-cases/accounts";

import { createAccountSchema } from "./_lib/schema";

export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(createAccountSchema)
  .handler(async ({ body }) => {
    const useCase = new CreateCompanyAccountUseCase();
    const input: CreateCompanyAccountInput = {
      ...body,
      roles: body.roles as CompanyRole[],
    };
    return useCase.run(input, { successStatus: 201 });
  });

export const GET = withApi()
  .auth()
  .handler(async () => {
    const useCase = new ListCompanyAccountsUseCase();
    return useCase.run();
  });

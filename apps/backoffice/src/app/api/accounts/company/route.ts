import { CompanyRole } from "@megawin/identity/entities";
import {
  type CreateCompanyAccountInput,
  CreateCompanyAccountUseCase,
  ListCompanyAccountsUseCase,
} from "@megawin/identity-application/use-cases/accounts";

import { withApi } from "@/lib/api";

import { createAccountSchema } from "./_lib/schema";

const createCompanyAccountUseCase = new CreateCompanyAccountUseCase();
const listCompanyAccountsUseCase = new ListCompanyAccountsUseCase();

export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(createAccountSchema)
  .handler(async ({ body }) => {
    const input: CreateCompanyAccountInput = {
      ...body,
      roles: body.roles as CompanyRole[],
    };
    return createCompanyAccountUseCase.run(input);
  });

export const GET = withApi()
  .auth()
  .handler(async () => {
    return listCompanyAccountsUseCase.run();
  });

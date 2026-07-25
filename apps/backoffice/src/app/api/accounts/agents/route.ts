import { CompanyRole } from "@megawin/identity/entities";
import { CreateAgentAccountUseCase, ListAgentAccountsUseCase } from "@megawin/identity-application/use-cases/accounts";

import { withApi } from "@/lib/api";

import { createAgentSchema } from "./_lib/schema";

const createAgentAccountUseCase = new CreateAgentAccountUseCase();
const listAgentAccountsUseCase = new ListAgentAccountsUseCase();

export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(createAgentSchema)
  .handler(async ({ body }) => {
    return createAgentAccountUseCase.run(body, { successStatus: 201 });
  });

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async () => {
    return listAgentAccountsUseCase.run();
  });

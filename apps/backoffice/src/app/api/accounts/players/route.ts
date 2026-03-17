import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities/account";
import { ListPlayerAccountsUseCase } from "@megawin/identity-application/use-cases/accounts";

import { listPlayersQuerySchema } from "./_lib/schema";

const listPlayerAccountsUseCase = new ListPlayerAccountsUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(listPlayersQuerySchema)
  .handler(async ({ query }) => {
    return listPlayerAccountsUseCase.run({
      tenantId: query.tenantId,
      page: query.page,
      limit: query.limit,
    });
  });

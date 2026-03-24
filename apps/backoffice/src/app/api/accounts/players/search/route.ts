import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { SearchPlayerAccountsUseCase } from "@megawin/identity-application/use-cases/accounts";

import { searchPlayerQuerySchema } from "./_lib/schema";

const searchPlayerAccountsUseCase = new SearchPlayerAccountsUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(searchPlayerQuerySchema)
  .handler(async ({ query }) => {
    return searchPlayerAccountsUseCase.run({ keyword: query.keyword });
  });

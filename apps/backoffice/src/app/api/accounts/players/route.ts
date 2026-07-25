import { CompanyRole } from "@megawin/identity/entities";
import { ListPlayerAccountsCursorUseCase } from "@megawin/identity-application/use-cases/accounts";

import { withApi } from "@/lib/api";

import { listPlayersQuerySchema } from "./_lib/schema";

const listPlayerAccountsCursorUseCase = new ListPlayerAccountsCursorUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(listPlayersQuerySchema)
  .handler(async ({ query }) => {
    return listPlayerAccountsCursorUseCase.run({
      tenantId: query.tenantId,
      afterId: query.after ?? undefined,
      beforeId: query.before ?? undefined,
      limit: query.limit,
    });
  });

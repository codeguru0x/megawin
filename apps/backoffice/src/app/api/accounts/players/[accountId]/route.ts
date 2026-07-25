import { CompanyRole } from "@megawin/identity/entities";
import { GetPlayerAccountUseCase } from "@megawin/identity-application/use-cases/accounts";

import { withApi } from "@/lib/api";

const getPlayerAccountUseCase = new GetPlayerAccountUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async ({ params }) => {
    const accountId = (params as { accountId: string }).accountId;
    return getPlayerAccountUseCase.run({ accountId });
  });

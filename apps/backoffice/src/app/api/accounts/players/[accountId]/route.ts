import { GetPlayerAccountUseCase } from "@megawin/identity-application/use-cases/accounts";
import { CompanyRole } from "@megawin/identity/entities";
import { z } from "zod";

import { withApi } from "@/lib/api";

const getPlayerAccountUseCase = new GetPlayerAccountUseCase();

const paramsSchema = z.object({
  accountId: z.string().min(1),
});
export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .params(paramsSchema)
  .handler(async ({ params }) => {
    const accountId = params.accountId;
    return getPlayerAccountUseCase.run({ accountId });
  });

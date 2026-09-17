import { GetMyMfaStatusUseCase } from "@megawin/identity-application/use-cases/accounts";
import { CompanyRole } from "@megawin/identity/entities";

import { withApi } from "@/lib/api";

const getMyMfaStatusUseCase = new GetMyMfaStatusUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async ({ session }) => {
    const username = session!.user.username;

    return getMyMfaStatusUseCase.run({ username });
  });

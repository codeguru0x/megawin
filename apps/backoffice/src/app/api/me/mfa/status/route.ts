import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities/account";
import { GetMyMfaStatusUseCase } from "@megawin/identity-application/use-cases/accounts";

const getMyMfaStatusUseCase = new GetMyMfaStatusUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async ({ session }) => {
    const username = session!.user.username;

    return getMyMfaStatusUseCase.run({ username });
  });

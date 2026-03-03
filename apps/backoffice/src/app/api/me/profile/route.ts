import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities/account";
import { GetMyProfileUseCase } from "@megawin/identity-application/use-cases/accounts";

const getMyProfileUseCase = new GetMyProfileUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async ({ session }) => {
    const username = session!.user.username;

    return getMyProfileUseCase.run({ username });
  });

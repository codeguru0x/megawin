import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities/account";
import { GetSignOutRedirectUrlUseCase } from "@megawin/identity-application/use-cases/security";
import { env } from "@/env";

const getSignOutRedirectUrlUseCase = new GetSignOutRedirectUrlUseCase();

/**
 * POST /api/auth/sign-out-redirect
 *
 * Trả về Cognito /logout URL để client redirect sang sau khi better-auth signOut.
 * Credentials Cognito ở lại server — không cần expose NEXT_PUBLIC_.
 */
export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async () => {
    return getSignOutRedirectUrlUseCase.run({
      cognitoDomain: env.COGNITO_WORKFORCE_DOMAIN,
      clientId: env.COGNITO_WORKFORCE_CLIENT_ID,
      logoutUri: `${env.BETTER_AUTH_URL}/login`,
    });
  });

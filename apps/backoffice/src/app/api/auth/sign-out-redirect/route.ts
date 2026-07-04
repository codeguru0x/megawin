import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { GetSignOutRedirectUrlUseCase } from "@megawin/identity-application/use-cases/security";
import { auditLogout } from "@megawin/identity-application/services";
import { actorFromSession } from "@/lib/audit-actor";
import { env } from "@/env";

const getSignOutRedirectUrlUseCase = new GetSignOutRedirectUrlUseCase();

/**
 * POST /api/auth/sign-out-redirect
 *
 * Trả về Cognito /logout URL để client redirect sang sau khi better-auth signOut.
 * Credentials Cognito ở lại server — không cần expose NEXT_PUBLIC_.
 *
 * Audit `auth.logout` ở ĐÂY (không ở better-auth hook): route này chạy KHI user
 * còn session hợp lệ (đã qua `.auth()`), nên actor luôn xác định. better-auth
 * `signOut` endpoint xoá cookie trước khi hook chạy → mất actor, không audit được.
 */
export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async ({ session, request }) => {
    // Fire-and-forget: audit fail KHÔNG bao giờ chặn logout. BO chỉ có company/agent
    // (player dùng app khác) nên mọi session ở đây đều đủ điều kiện ghi audit.
    auditLogout({ actor: actorFromSession(session!, request) });

    return getSignOutRedirectUrlUseCase.run({
      cognitoDomain: env.COGNITO_WORKFORCE_DOMAIN,
      clientId: env.COGNITO_WORKFORCE_CLIENT_ID,
      logoutUri: `${env.BETTER_AUTH_URL}/login`,
    });
  });

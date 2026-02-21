/**
 * API route builder đã bind sẵn getSession cho backoffice.
 *
 * Sử dụng better-auth để resolve session từ request cookies.
 * Generic AccountRole đảm bảo type-safety cho .auth({ roles: [...] }).
 */

import type { NextRequest } from "next/server";

import { createApiRouteBuilder, type RouteSession } from "@megawin/next/server";
import {
  ALL_ROLE_VALUES,
  AccountStatus,
  CompanyRole,
  type AccountRole,
} from "@megawin/identity-domain/accounts/account";
import { auth } from "@/lib/auth";

function parseCognitoRoles(raw: unknown): AccountRole[] {
  let items: unknown[];

  if (Array.isArray(raw)) {
    items = raw;
  } else if (typeof raw === "string" && raw.length > 0) {
    items = raw.split(",").map((s) => s.trim());
  } else {
    return [];
  }

  return items.filter(
    (r): r is AccountRole =>
      typeof r === "string" &&
      (ALL_ROLE_VALUES as readonly string[]).includes(r),
  );
}

/**
 * Resolve session từ better-auth.
 * Đọc session cookie từ request headers → trả RouteSession hoặc null.
 */
async function getSession(
  req: NextRequest,
): Promise<RouteSession<AccountRole> | null> {
  const session = await auth.api.getSession({ headers: req.headers });

  if (!session) return null;

  const user = session.user as Record<string, unknown>;

  console.log("[getSession] user object:", JSON.stringify(user, null, 2));
  console.log("[getSession] user.roles:", user.roles, "type:", typeof user.roles);

  const roles = parseCognitoRoles(user.roles ?? []);
  const accountStatus =
    (user.accountStatus as string) ?? AccountStatus.Active;

  console.log("[getSession] parsed roles:", roles);
  console.log("[getSession] accountStatus:", accountStatus);

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      roles,
      accountStatus,
    },
  };
}

export const withApi = createApiRouteBuilder<AccountRole>({
  getSession,
  superRoles: [CompanyRole.Admin],
});

/**
 * `withApi` của backoffice — BOUND INSTANCE, tạo bằng cách gọi factory `createApiRouteBuilder()`
 * (generic, sống ở `@megawin/next/server`) đúng 1 LẦN với `getSession`/`superRoles` riêng của app này.
 *
 * Sử dụng better-auth để resolve session từ request cookies.
 * Generic AccountRole đảm bảo type-safety cho .auth({ roles: [...] }).
 *
 * Mọi route handler (`app/api/.../route.ts`) của backoffice import và dùng lại đúng instance này —
 * KHÔNG gọi lại `createApiRouteBuilder()` ở nơi khác trong app.
 */

import type { NextRequest } from "next/server";

import type { AccountRole } from "@megawin/identity/entities";
import { AccountStatus, ALL_ROLE_VALUES, CompanyRole } from "@megawin/identity/entities";
import { createApiRouteBuilder, type RouteSession } from "@megawin/next/server";

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
    (r): r is AccountRole => typeof r === "string" && (ALL_ROLE_VALUES as readonly string[]).includes(r),
  );
}

/**
 * Resolve session từ better-auth.
 * Đọc session cookie từ request headers → trả RouteSession hoặc null.
 */
async function getSession(req: NextRequest): Promise<RouteSession<AccountRole> | null> {
  const session = await auth.api.getSession({ headers: req.headers });

  if (!session) return null;

  const user = session.user as Record<string, unknown>;

  const roles = parseCognitoRoles(user.roles ?? []);
  const accountStatus = (user.accountStatus as string) ?? AccountStatus.Active;

  return {
    user: {
      id: session.user.id,
      sub: (user.sub as string) ?? "",
      email: session.user.email,
      name: session.user.name,
      username: (user.username as string) ?? "",
      roles,
      accountStatus,
      accountId: (user.accountId as string) ?? "",
      tenantId: (user.tenantId as string) ?? "",
      accountType: (user.accountType as string) ?? "",
    },
  };
}

export const withApi = createApiRouteBuilder<AccountRole>({
  getSession,
  superRoles: [CompanyRole.Admin],
});

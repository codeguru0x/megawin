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
import { CompanyRole } from "@megawin/identity/entities";
import { createApiRouteBuilder, type RouteSession } from "@megawin/next/server";

import { resolveAuthSession } from "@/lib/auth-session";

/**
 * Resolve session từ better-auth cho route Next.js.
 * Logic thật nằm ở `resolveAuthSession` (`lib/auth-session.ts`) — dùng chung với
 * eve channel auth (`agent/channels/eve.ts`), chỉ khác type request (NextRequest vs Request).
 */
async function getSession(req: NextRequest): Promise<RouteSession<AccountRole> | null> {
  return resolveAuthSession(req.headers);
}

export const withApi = createApiRouteBuilder<AccountRole>({
  getSession,
  superRoles: [CompanyRole.Admin],
});

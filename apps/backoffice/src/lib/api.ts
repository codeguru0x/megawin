/**
 * API route builder đã bind sẵn getSession cho backoffice.
 *
 * Sử dụng better-auth để resolve session từ request cookies.
 */

import type { NextRequest } from "next/server";

import { createApiRouteBuilder, type RouteSession } from "@megawin/next/server";
import { auth } from "@/lib/auth";

/**
 * Resolve session từ better-auth.
 * Đọc session cookie từ request headers → trả RouteSession hoặc null.
 */
async function getSession(req: NextRequest): Promise<RouteSession | null> {
  const session = await auth.api.getSession({ headers: req.headers });

  if (!session) return null;

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      roles: [],
    },
  };
}

/**
 * withApi – fluent builder cho tất cả API routes của backoffice.
 *
 * @example
 * // Auth required + roles
 * export const POST = withApi()
 *   .auth({ roles: ["Admin"] })
 *   .body(createAccountSchema)
 *   .handler(async ({ body, session }) => {
 *     const useCase = new CreateCompanyAccountUseCase();
 *     return useCase.run(body, { successStatus: 201 });
 *   });
 *
 * // Auth required
 * export const GET = withApi()
 *   .auth()
 *   .query(listQuerySchema)
 *   .handler(async ({ query }) => {
 *     const useCase = new ListCompanyAccountsUseCase();
 *     return useCase.run(query);
 *   });
 */
export const withApi = createApiRouteBuilder({ getSession });

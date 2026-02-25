/**
 * API route builder cho agent portal.
 *
 * Sử dụng better-auth để resolve session từ request cookies.
 * Chỉ cho phép agent roles.
 */

import type { NextRequest } from "next/server";

import { createApiRouteBuilder, type RouteSession } from "@megawin/next/server";
import {
  ALL_ROLE_VALUES,
  AccountStatus,
  AgentRole,
  type AccountRole,
} from "@megawin/identity/entities/account";
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

async function getSession(
  req: NextRequest,
): Promise<RouteSession<AccountRole> | null> {
  const session = await auth.api.getSession({ headers: req.headers });

  if (!session) return null;

  const user = session.user as Record<string, unknown>;
  const roles = parseCognitoRoles(user.roles ?? []);
  const accountStatus =
    (user.accountStatus as string) ?? AccountStatus.Active;

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
  superRoles: [AgentRole.Agent],
});

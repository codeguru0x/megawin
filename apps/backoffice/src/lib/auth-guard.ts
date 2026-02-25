/**
 * Server-side scope guards cho operator (company/staff) và tenant (agent).
 *
 * Sử dụng trong layout.tsx của mỗi route group để đảm bảo
 * chỉ đúng loại tài khoản mới truy cập được scope tương ứng.
 */

import { redirect } from "next/navigation";

import { AccountType } from "@megawin/identity/entities/account";

import { requireSession } from "@/lib/auth-server";
import type { Session } from "@/lib/auth";

/**
 * Guard cho scope operator – chỉ cho phép accountType === "company".
 * Redirect sang /unauthorized nếu không phải company account.
 */
export async function requireOperatorSession(): Promise<Session> {
  const session = await requireSession();
  const user = session.user as Record<string, unknown>;

  if (user.accountType !== AccountType.Company) {
    redirect("/unauthorized");
  }

  return session;
}

/**
 * Guard cho scope tenant – chỉ cho phép accountType === "agent".
 * Redirect sang /unauthorized nếu không phải agent account.
 */
export async function requireTenantSession(): Promise<Session> {
  const session = await requireSession();
  const user = session.user as Record<string, unknown>;

  if (user.accountType !== AccountType.Agent) {
    redirect("/unauthorized");
  }

  return session;
}

/**
 * Server-side scope guard cho backoffice (operator portal).
 *
 * Chỉ cho phép accountType === "company" truy cập.
 * Redirect sang /unauthorized nếu không phải company account.
 */

import { redirect } from "next/navigation";

import { AccountType } from "@megawin/identity/entities";

import { requireSession } from "@/lib/auth-server";
import type { Session } from "@/lib/auth";

export async function requireOperatorSession(): Promise<Session> {
  const session = await requireSession();
  const user = session.user as Record<string, unknown>;

  if (user.accountType !== AccountType.Company) {
    redirect("/unauthorized");
  }

  return session;
}

/**
 * Server-side scope guard cho agent portal.
 *
 * Chỉ cho phép accountType === "agent" truy cập.
 * Redirect sang /unauthorized nếu không phải agent account.
 */

import { redirect } from "next/navigation";

import { AccountType } from "@megawin/identity/entities";

import { requireSession } from "@/lib/auth-server";
import type { Session } from "@/lib/auth";

export async function requireAgentSession(): Promise<Session> {
  const session = await requireSession();
  const user = session.user as Record<string, unknown>;

  if (user.accountType !== AccountType.Agent) {
    redirect("/unauthorized");
  }

  return session;
}

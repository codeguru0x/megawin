import { redirect } from "next/navigation";

import { AccountType } from "@megawin/identity-domain/accounts/account";

import { requireSession } from "@/lib/auth-server";

/**
 * Root page – redirect đến trang mặc định dựa trên accountType.
 * Company/Staff -> /default (operator dashboard)
 * Agent -> /tenant/lotto535/tickets (tenant portal)
 */
export default async function RootPage() {
  const session = await requireSession();
  const user = session.user as Record<string, unknown>;

  if (user.accountType === AccountType.Agent) {
    redirect("/tenant/lotto535/tickets");
  }

  redirect("/default");
}

import type { ReactNode } from "react";

import { requireSession } from "@/lib/auth-server";
import { QueryProvider } from "@/providers/query-provider";

export default async function Layout({
  children,
}: Readonly<{ children: ReactNode }>) {
  await requireSession();

  return <QueryProvider>{children}</QueryProvider>;
}

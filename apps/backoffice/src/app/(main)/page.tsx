import { redirect } from "next/navigation";

import { requireSession } from "@/lib/auth-server";

export default async function RootPage() {
  await requireSession();
  redirect("/dashboard");
}

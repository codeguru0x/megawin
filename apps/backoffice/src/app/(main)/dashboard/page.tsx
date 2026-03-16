import { requireSession } from "@/lib/auth-server";
import { DashboardContent } from "./dashboard-content";

export const metadata = {
  title: "Dashboard",
};

/**
 * Trang Dashboard — Server Component wrapper.
 *
 * Kiểm tra session rồi render DashboardContent (Client Component).
 * Mọi data fetching nằm trong DashboardContent qua React Query.
 */
export default async function DashboardPage() {
  await requireSession();
  return <DashboardContent />;
}

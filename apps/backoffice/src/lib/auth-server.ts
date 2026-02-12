/**
 * Server-side auth helpers.
 *
 * Các function tiện ích để sử dụng trong Server Components và Server Actions.
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth, type Session } from "@/lib/auth";

/**
 * Lấy session hiện tại trong Server Component / Server Action.
 * Trả null nếu chưa đăng nhập.
 */
export async function getServerSession(): Promise<Session | null> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  return session;
}

/**
 * Yêu cầu session – redirect sang /login nếu chưa đăng nhập.
 * Dùng trong Server Component cần bắt buộc auth.
 */
export async function requireSession(): Promise<Session> {
  const session = await getServerSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}

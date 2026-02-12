/**
 * Login page – redirect user sang Cognito Hosted UI.
 *
 * Khi user chưa đăng nhập, proxy redirect về đây.
 * Page này tự động trigger đăng nhập qua Cognito hoặc hiển thị nút login.
 */

import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";

import { LoginClient } from "./_components/login-client";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  // Kiểm tra nếu đã đăng nhập → redirect về trang chính
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const { callbackUrl } = await searchParams;

  if (session) {
    redirect(callbackUrl ?? "/");
  }

  return <LoginClient callbackUrl={callbackUrl} />;
}

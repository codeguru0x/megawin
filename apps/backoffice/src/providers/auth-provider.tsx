"use client";

/**
 * AuthProvider – cung cấp session context cho toàn bộ client components.
 *
 * Wrap ở root layout level. Sử dụng useSession() từ better-auth/react
 * để reactive theo session state thay đổi.
 *
 * Ngoài việc expose context, provider này còn đóng vai trò **SessionWatchdog**:
 * khi `useSession` trả về `null` (session đã expire / bị invalidate) trên các
 * route bảo vệ, provider sẽ tự redirect sang `/login?callbackUrl=...` thay vì
 * để UI âm thầm fallback sang trạng thái "User" không đầy đủ thông tin.
 */

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useSession } from "@/lib/auth-client";

interface AuthContextValue {
  /** Session data (user info + session metadata). */
  session: ReturnType<typeof useSession>["data"];
  /** True khi đang fetch session. */
  isPending: boolean;
  /** Error nếu fetch session thất bại. */
  error: ReturnType<typeof useSession>["error"];
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Các route public – không cần redirect về /login khi session null.
 * Phải đồng bộ với `PUBLIC_ROUTES` trong `src/proxy.ts`.
 */
const PUBLIC_ROUTES = ["/login", "/auth/error", "/unauthorized"] as const;

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const { data: session, isPending, error } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isPending) return;
    if (session) return;
    if (isPublicRoute(pathname)) return;

    const callbackUrl = encodeURIComponent(pathname);
    router.replace(`/login?callbackUrl=${callbackUrl}`);
  }, [session, isPending, pathname, router]);

  return (
    <AuthContext.Provider value={{ session, isPending, error }}>{children}</AuthContext.Provider>
  );
}

/**
 * Hook lấy auth context – throw nếu dùng ngoài AuthProvider.
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

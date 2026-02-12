"use client";

/**
 * AuthProvider – cung cấp session context cho toàn bộ client components.
 *
 * Wrap ở root layout level. Sử dụng useSession() từ better-auth/react
 * để reactive theo session state thay đổi.
 */

import { createContext, useContext, type ReactNode } from "react";
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

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const { data: session, isPending, error } = useSession();

  return (
    <AuthContext.Provider value={{ session, isPending, error }}>
      {children}
    </AuthContext.Provider>
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

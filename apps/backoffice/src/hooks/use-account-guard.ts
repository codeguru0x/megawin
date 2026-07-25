"use client";

import { createAccountGuard } from "@megawin/next/client";

import { useSession } from "@/lib/auth-client";

/**
 * Hook kiểm tra account status và tự redirect khi không đủ quyền.
 *
 * - Suspended → redirect về /login
 * - Chưa đăng nhập → redirect về /login?callbackUrl=...
 * - requireActive + ReadOnly → redirect về /unauthorized
 *
 * @example
 * // Trang chỉ cần đăng nhập (read-only vẫn vào được)
 * const { isReadOnly, isLoading } = useAccountGuard();
 *
 * // Trang cần quyền ghi (edit, create, delete)
 * const { isLoading } = useAccountGuard({ requireActive: true });
 */
export const useAccountGuard = createAccountGuard({
  useSession,
  suspendedRedirect: "/login",
  unauthorizedRedirect: "/login",
});

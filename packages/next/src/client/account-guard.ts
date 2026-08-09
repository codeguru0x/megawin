/**
 * Client-side hook factory: kiểm tra account status và redirect khi bị suspended.
 *
 * Thiết kế factory pattern để re-use cho nhiều Next.js app:
 * - Consumer truyền vào hàm lấy session (useSession từ better-auth)
 * - Hook tự check accountStatus và redirect về trang chỉ định khi suspended
 *
 * @example
 * // lib/hooks/use-account-guard.ts
 * import { createAccountGuard } from "@megawin/next/client";
 * import { useSession } from "@/lib/auth-client";
 *
 * export const useAccountGuard = createAccountGuard({
 *   useSession,
 *   suspendedRedirect: "/login",
 *   unauthorizedRedirect: "/login",
 * });
 *
 * // Trong page component:
 * const { isReadOnly, accountStatus, isLoading } = useAccountGuard();
 * // hoặc bắt buộc active:
 * const { accountStatus } = useAccountGuard({ requireActive: true });
 */

"use client";

import { useEffect, useMemo } from "react";

import { usePathname, useRouter } from "next/navigation";

export interface AccountGuardSession {
  user?: {
    accountStatus?: string;
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
}

export interface CreateAccountGuardOptions {
  /**
   * Hook lấy session từ better-auth (useSession).
   * Phải trả về { data: session | null, isPending: boolean }.
   */
  useSession: () => {
    data: AccountGuardSession | null;
    isPending: boolean;
  };

  /** URL redirect khi account bị suspended (không login được). Mặc định: "/login" */
  suspendedRedirect?: string;

  /** URL redirect khi chưa đăng nhập. Mặc định: "/login" */
  unauthorizedRedirect?: string;
}

export interface UseAccountGuardOptions {
  /**
   * Nếu true, redirect khi status !== "active".
   * Dùng cho trang cần quyền ghi.
   */
  requireActive?: boolean;

  /** URL redirect tuỳ chỉnh cho từng page. */
  redirectTo?: string;

  /** Bỏ qua guard (vd: cho trang public). */
  skip?: boolean;
}

export interface AccountGuardResult {
  /** Account status hiện tại. */
  accountStatus: string | undefined;
  /** true nếu account đang ở trạng thái read_only. */
  isReadOnly: boolean;
  /** true nếu account đang active. */
  isActive: boolean;
  /** true nếu account bị suspended. */
  isSuspended: boolean;
  /** true nếu đang load session. */
  isLoading: boolean;
  /** true nếu đã authenticated. */
  isAuthenticated: boolean;
}

export function createAccountGuard(config: CreateAccountGuardOptions) {
  const { useSession: useSessionHook, suspendedRedirect = "/login", unauthorizedRedirect = "/login" } = config;

  return function useAccountGuard(options: UseAccountGuardOptions = {}): AccountGuardResult {
    const { requireActive = false, redirectTo, skip = false } = options;
    const { data: session, isPending } = useSessionHook();
    const router = useRouter();
    const pathname = usePathname();

    const accountStatus = session?.user?.accountStatus as string | undefined;

    const result = useMemo<Omit<AccountGuardResult, "isLoading">>(() => {
      const isAuthenticated = session != null && session.user != null;
      return {
        accountStatus,
        isReadOnly: accountStatus === "read_only",
        isActive: accountStatus === "active",
        isSuspended: accountStatus === "suspended",
        isAuthenticated,
      };
    }, [accountStatus, session]);

    useEffect(() => {
      if (skip || isPending) return;

      if (!result.isAuthenticated) {
        const target = redirectTo ?? unauthorizedRedirect;
        const url = target.includes("?")
          ? `${target}&callbackUrl=${encodeURIComponent(pathname)}`
          : `${target}?callbackUrl=${encodeURIComponent(pathname)}`;
        router.replace(url);
        return;
      }

      if (result.isSuspended) {
        router.replace(redirectTo ?? suspendedRedirect);
        return;
      }

      if (requireActive && result.isReadOnly) {
        router.replace(redirectTo ?? "/unauthorized");
      }
    }, [
      skip,
      isPending,
      result.isAuthenticated,
      result.isSuspended,
      result.isReadOnly,
      requireActive,
      redirectTo,
      router,
      pathname,
    ]);

    return { ...result, isLoading: isPending };
  };
}

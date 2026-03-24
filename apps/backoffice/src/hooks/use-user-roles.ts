"use client";

import { useMemo } from "react";
import { ALL_ROLE_VALUES } from "@megawin/identity/entities";
import type { AccountRole } from "@megawin/identity/entities";
import { useAuth } from "@/providers/auth-provider";

/**
 * Hook lấy danh sách roles của user đang đăng nhập từ session.
 *
 * Parse chuỗi roles từ better-auth session (Cognito custom claims).
 * Trả về mảng rỗng nếu session chưa load hoặc không có role.
 */
export function useUserRoles(): AccountRole[] {
  const { session } = useAuth();

  return useMemo(() => {
    const raw = (session?.user as Record<string, unknown>)?.roles;

    let items: unknown[];
    if (Array.isArray(raw)) {
      items = raw;
    } else if (typeof raw === "string" && raw.length > 0) {
      items = raw.split(",").map((s) => s.trim());
    } else {
      return [];
    }

    return items.filter(
      (r): r is AccountRole =>
        typeof r === "string" && (ALL_ROLE_VALUES as readonly string[]).includes(r),
    );
  }, [session]);
}

/**
 * Kiểm tra user hiện tại có ít nhất 1 trong các roles cho phép không.
 *
 * @param allowedRoles - Danh sách roles cho phép. Nếu undefined/rỗng → không giới hạn → trả true.
 * @param userRoles    - Roles của user (từ useUserRoles).
 */
export function hasAnyRole(
  allowedRoles: AccountRole[] | undefined,
  userRoles: AccountRole[],
): boolean {
  // Không khai báo roles → không giới hạn → luôn hiển thị
  if (!allowedRoles || allowedRoles.length === 0) return true;
  return allowedRoles.some((r) => userRoles.includes(r));
}

"use client";

import { useMemo } from "react";

import type { AccountRole } from "@megawin/identity/entities";

import { parseAccountRoles } from "@/lib/roles";
import { useAuth } from "@/providers/auth-provider";

/**
 * Hook lấy danh sách roles của user đang đăng nhập từ session (client-side).
 *
 * ⚠️ Chỉ dùng cho UI render SAU tương tác của user (dialog, popover…).
 * KHÔNG dùng để filter nội dung được SSR: `useSession()` chưa có dữ liệu lúc
 * server render nên roles = `[]` ở server nhưng đầy đủ ở client → hydration
 * mismatch (đã xảy ra với sidebar, xem `NavMain`). Với nội dung SSR, lấy roles
 * từ server session rồi truyền xuống bằng prop.
 */
export function useUserRoles(): AccountRole[] {
  const { session } = useAuth();

  return useMemo(() => parseAccountRoles((session?.user as Record<string, unknown>)?.roles), [session]);
}

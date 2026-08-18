/**
 * Parse + kiểm tra roles của account — dùng CHUNG cho server và client.
 *
 * File này KHÔNG có `"use client"` và KHÔNG import gì từ React/next để cả
 * server component (`app/(main)/layout.tsx`), server helper (`lib/auth-session.ts`)
 * và client component (`hooks/use-user-roles.ts`) đều import được.
 */

import type { AccountRole } from "@megawin/identity/entities";
import { ALL_ROLE_VALUES } from "@megawin/identity/entities";

/**
 * Chuẩn hoá roles từ Cognito custom claim về `AccountRole[]`.
 *
 * Claim có thể là array (`["admin"]`) hoặc chuỗi CSV (`"admin,operator"`) tuỳ
 * cách Cognito trả về, nên chấp nhận cả hai. Giá trị không thuộc
 * `ALL_ROLE_VALUES` bị loại bỏ thay vì throw — role lạ chỉ nên mất quyền,
 * không nên làm sập cả trang.
 */
export function parseAccountRoles(raw: unknown): AccountRole[] {
  let items: unknown[];

  if (Array.isArray(raw)) {
    items = raw;
  } else if (typeof raw === "string" && raw.length > 0) {
    items = raw.split(",").map((s) => s.trim());
  } else {
    return [];
  }

  return items.filter(
    (r): r is AccountRole => typeof r === "string" && (ALL_ROLE_VALUES as readonly string[]).includes(r),
  );
}

/**
 * Kiểm tra user hiện tại có ít nhất 1 trong các roles cho phép không.
 *
 * @param allowedRoles - Danh sách roles cho phép. Nếu undefined/rỗng → không giới hạn → trả true.
 * @param userRoles    - Roles của user.
 */
export function hasAnyRole(allowedRoles: AccountRole[] | undefined, userRoles: readonly AccountRole[]): boolean {
  // Không khai báo roles → không giới hạn → luôn hiển thị
  if (!allowedRoles || allowedRoles.length === 0) {
    return true;
  }
  return allowedRoles.some((r) => userRoles.includes(r));
}

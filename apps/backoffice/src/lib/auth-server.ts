/**
 * Server-side auth helpers.
 *
 * Các function tiện ích để sử dụng trong Server Components và Server Actions.
 */

import { cache } from "react";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import type { AccountRole } from "@megawin/identity/entities";

import { auth, type Session } from "@/lib/auth";
import { resolveAuthSession } from "@/lib/auth-session";
import { hasAnyRole } from "@/lib/roles";

/**
 * Lấy session hiện tại trong Server Component / Server Action.
 * Trả null nếu chưa đăng nhập.
 *
 * Bọc `React.cache` — dedupe TRONG 1 request. Mỗi render `(main)` có ít nhất 2 caller độc lập
 * (`(main)/layout.tsx` qua `requireOperatorSession`, và page như `dashboard/page.tsx` gọi
 * `requireSession` lần nữa); không cache thì `auth.api.getSession` chạy 2 lượt cho cùng 1 request.
 * `cache` KHÔNG dùng đối số nên không có bẫy "inline object → luôn cache miss".
 * Phạm vi cache = 1 request, không rò session giữa các user.
 */
export const getServerSession = cache(async (): Promise<Session | null> => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  return session;
});

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

/**
 * Guard cấp trang — chặn truy cập trực tiếp URL khi user không có bất kỳ role nào trong
 * `roles`. Dùng 1 LẦN trong `layout.tsx` của route cần bảo vệ (VD `(main)/resultfeed/layout.tsx`)
 * — mọi page con tự động được bảo vệ, không lặp lại guard ở từng page.
 *
 * Khác `requireSession` (chỉ check đã login): guard này check thêm ROLE. Chưa login → `/login`
 * (giữ hành vi cũ); đã login nhưng thiếu role → `/dashboard` (không tiết lộ trang tồn tại cho
 * user không có quyền, tương tự việc sidebar cũng ẩn hẳn item này với họ).
 *
 * Dùng `resolveAuthSession` (không phải `auth.api.getSession` thô) để có `session.user.roles`
 * đã parse sẵn thành mảng — khớp shape `RouteSession<AccountRole>` dùng ở route API.
 */
export async function requireRole(roles: AccountRole[]): Promise<void> {
  const session = await resolveAuthSession(await headers());
  if (!session) {
    redirect("/login");
  }
  if (!hasAnyRole(roles, session.user.roles)) {
    redirect("/dashboard");
  }
}

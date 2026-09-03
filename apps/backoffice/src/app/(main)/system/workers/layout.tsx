import type { ReactNode } from "react";

import { CompanyRole } from "@megawin/identity/entities";

import { requireRole } from "@/lib/auth-server";

/**
 * Page-level guard cho `(main)/system/workers` — chỉ `CompanyRole.Admin`.
 *
 * Route API `/api/system/workers*` đã tự chặn qua `.auth({ roles: [CompanyRole.Admin] })`, nhưng
 * đó không chặn được việc mở TRỰC TIẾP URL trang (session hợp lệ, chỉ thiếu role) — trang sẽ
 * render vỏ UI rồi mới nhận lỗi 403 khi gọi API. Guard này chặn NGAY ở Server Component, trước
 * khi bất kỳ page con nào render.
 */
export default async function WorkersLayout({ children }: { children: ReactNode }) {
  await requireRole([CompanyRole.Admin]);
  return <>{children}</>;
}

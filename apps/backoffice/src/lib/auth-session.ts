/**
 * Resolve better-auth session từ request headers.
 *
 * Logic dùng CHUNG cho 2 nơi:
 * - `lib/api.ts` (`getSession`) — route Next.js nhận `NextRequest`.
 * - `agent/channels/eve.ts` — eve channel `AuthFn` nhận `Request` (Fetch API chuẩn).
 *
 * Cả hai type chỉ cần `.headers` (`Headers`) nên tách hàm nhận thẳng `Headers` để
 * dùng lại ở cả hai nơi mà không cast/ép type NextRequest ↔ Request.
 */

import type { AccountRole } from "@megawin/identity/entities";
import { AccountStatus } from "@megawin/identity/entities";
import type { RouteSession } from "@megawin/next/server";

import { auth } from "@/lib/auth";
import { parseAccountRoles } from "@/lib/roles";

/**
 * Đọc field mở rộng (Cognito custom attribute) trên `user` an toàn kiểu — better-auth chỉ
 * biết field chuẩn (`id`/`email`/`name`), field còn lại nằm ngoài type nên phải index qua
 * `Record<string, unknown>` rồi TỰ kiểm tra `typeof`, KHÔNG dùng `as string`: cast xoá mất khả
 * năng `undefined` trước mắt compiler, khiến Biome coi `?? fallback` là dead code trong khi
 * runtime field này hoàn toàn có thể thiếu (attribute Cognito optional/user cũ chưa migrate).
 */
function readStringField(user: Record<string, unknown>, key: string, fallback: string): string {
  const value = user[key];
  return typeof value === "string" ? value : fallback;
}

/**
 * Resolve session từ better-auth bằng request headers.
 * Đọc session cookie từ headers → trả `RouteSession` hoặc `null` nếu chưa đăng nhập.
 */
export async function resolveAuthSession(headers: Headers): Promise<RouteSession<AccountRole> | null> {
  const session = await auth.api.getSession({ headers });

  if (!session) {
    return null;
  }

  const user = session.user as Record<string, unknown>;

  const roles = parseAccountRoles(user.roles ?? []);
  const accountStatus = readStringField(user, "accountStatus", AccountStatus.Active);

  return {
    user: {
      id: session.user.id,
      sub: readStringField(user, "sub", ""),
      email: session.user.email,
      name: session.user.name,
      username: readStringField(user, "username", ""),
      roles,
      accountStatus,
      accountId: readStringField(user, "accountId", ""),
      tenantId: readStringField(user, "tenantId", ""),
      accountType: readStringField(user, "accountType", ""),
    },
  };
}

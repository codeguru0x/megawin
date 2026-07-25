import type { NextRequest } from "next/server";

import { AuditActorType } from "@megawin/audit/entities";
import type { AuditActor } from "@megawin/audit/logger";
import { type AccountRole, AccountType } from "@megawin/identity/entities";
import type { RouteSession } from "@megawin/next/server";
import { extractClientIpFromWebHeaders, extractHttpContextFromWebHeaders } from "@megawin/shared/utils/ip";

/**
 * Map `AccountType` (identity) → {@link AuditActorType} (audit) — tường minh.
 *
 * `Record<AccountType, ...>` ép **exhaustive**: thêm `AccountType` mới mà quên map
 * ở đây → TS báo lỗi compile ngay, KHÔNG để lọt cast mù (`as`). Kèm guard
 * `_AssertAccountTypeIsActorType` ở trên ép value 2 enum không lệch nghĩa. Hai enum
 * là 2 contract độc lập ở 2 package — map qua bảng để mỗi bên tự do đổi an toàn.
 */
const ACCOUNT_TO_ACTOR_TYPE: Record<AccountType, AuditActorType> = {
  [AccountType.Company]: AuditActorType.Company,
  [AccountType.Agent]: AuditActorType.Agent,
  [AccountType.Player]: AuditActorType.Player,
};

/**
 * Shape tối thiểu của user cần để dựng {@link AuditActor} — subset dùng chung
 * giữa `RouteSession` (roles đã parse thành array) và `newSession` của better-auth
 * hook (roles còn ở dạng string CSV Cognito). `roles` nhận cả 2 dạng, normalize
 * bên trong.
 */
interface AuditActorSource {
  accountId?: string;
  username?: string;
  accountType?: string;
  tenantId?: string;
  roles?: readonly string[] | string;
}

/** Parse roles về mảng — chấp nhận array (RouteSession) hoặc CSV (Cognito claim). */
function normalizeRoles(roles: readonly string[] | string | undefined): string[] {
  if (Array.isArray(roles)) return [...roles];
  if (typeof roles === "string" && roles.length > 0) {
    return roles.split(",").map((s) => s.trim());
  }
  return [];
}

/**
 * Core normalizer: user (bất kỳ nguồn nào) → {@link AuditActor}. Dùng chung cho
 * cả route ({@link actorFromSession}) và better-auth hook ({@link actorFromAuthUser}).
 */
function toActor(u: AuditActorSource): AuditActor {
  const accountId = u.accountId ?? "";
  const username = u.username ?? "";
  return {
    // accountId là id nghiệp vụ (ULID/UUID portable); fallback username nếu thiếu.
    id: accountId || username,
    // Map tường minh accountType → AuditActorType; giá trị lạ → unknown (cờ forensic).
    type: ACCOUNT_TO_ACTOR_TYPE[u.accountType as AccountType] ?? AuditActorType.Unknown,
    // Nhãn hiển thị: ưu tiên username → accountId.
    name: username || accountId,
    roles: normalizeRoles(u.roles),
    tenantId: u.tenantId ?? "",
  };
}

/**
 * Map session user (better-auth) → {@link AuditActor} chuẩn cho use-case, GẮN
 * SẴN ip + HTTP context (userAgent/requestId) từ request.
 *
 * Adapter layer: nằm ở app (BO), KHÔNG ở `@megawin/audit` — tránh audit phụ
 * thuộc tầng vận chuyển (better-auth/RouteSession). Use-case nhận `AuditActor`
 * phẳng (đã kèm ip/userAgent/requestId), không biết session/request đến từ đâu,
 * KHÔNG cần thread field HTTP riêng trong input.
 *
 * LƯU Ý: actor LUÔN mang sẵn `userAgent`/`requestId` (đã extract), nhưng **có ghi
 * xuống DB hay không là quyết định ở tầng service** — `actorFields()` mặc định
 * KHÔNG spread 2 field này; action nào cần thì opt-in `...httpFields(actor)`. Nhờ
 * vậy tránh nhồi HTTP context vào mọi audit record.
 *
 * `actorType` map từ `session.user.accountType` qua {@link ACCOUNT_TO_ACTOR_TYPE}
 * (KHÔNG hardcode, KHÔNG cast mù). Giá trị lạ ngoài `AccountType` → fallback
 * `unknown` (cờ forensic — query ra để biết cần sửa adapter; không nên xảy ra với
 * session hợp lệ).
 * `tenantId` thường rỗng với company staff (action toàn cục), giữ nguyên session.
 * `ip` lấy từ `request.headers` qua {@link extractClientIpFromWebHeaders} —
 * `undefined` nếu bỏ trống `request` (caller nội bộ không có request); logger điền
 * sentinel `""`.
 * `userAgent`/`requestId` trích từ `request.headers` qua
 * {@link extractHttpContextFromWebHeaders} — `undefined` nếu thiếu header.
 *
 * @param session - Session đã resolve trong `withApi().handler`.
 * @param request - `NextRequest` từ handler context, để trích ip + HTTP context.
 *   Bỏ trống nếu không có (caller nội bộ) — actor khi đó không kèm HTTP context.
 *
 * @example
 * ```ts
 * .handler(async ({ session, body, request }) => {
 *   return useCase.run({ ...body, actor: actorFromSession(session!, request) });
 * });
 * ```
 */
export function actorFromSession(session: RouteSession<AccountRole>, request?: NextRequest): AuditActor {
  return { ...toActor(session.user), ...httpActorFields(request?.headers) };
}

/**
 * Map user thô từ better-auth `newSession` (OAuth callback hook) → {@link AuditActor},
 * GẮN SẴN ip + HTTP context từ headers.
 *
 * Khác {@link actorFromSession}: `newSession.user.roles` còn ở dạng CSV Cognito
 * claim (chưa parse thành array như `RouteSession`) và ip/HTTP context lấy từ
 * `Headers` thô (`ctx.headers`) thay vì `NextRequest`. {@link toActor} tự normalize
 * roles. Dùng trong `hooks.after` của better-auth để audit `auth.login`.
 *
 * Như {@link actorFromSession}: actor luôn mang `userAgent`/`requestId`, việc GHI
 * xuống DB là opt-in ở tầng service (`...httpFields(actor)`).
 *
 * @param user - `ctx.context.newSession.user` (shape better-auth + additionalFields).
 * @param headers - `ctx.headers` để trích ip + userAgent/requestId. Bỏ trống →
 *   actor không kèm HTTP context.
 */
export function actorFromAuthUser(user: AuditActorSource, headers?: Headers): AuditActor {
  return { ...toActor(user), ...httpActorFields(headers) };
}

/**
 * Trích ip + HTTP context (userAgent/requestId) từ Web `Headers` → phần bổ sung
 * cho {@link AuditActor}. Gom về 1 nguồn để {@link actorFromSession} /
 * {@link actorFromAuthUser} không lặp guard `request && …`.
 *
 * Nhận `Headers | undefined`: caller nội bộ không có request → `undefined` → mọi
 * field trả `undefined` (logger tự điền sentinel `""` cho `ip`). Delegate toàn bộ
 * logic sang `@megawin/shared/utils/ip` (nguồn chân lý duy nhất) — 2 helper shared
 * đã tự guard `undefined`, nên KHÔNG cần check `headers` ở đây.
 *
 * `ip`: fallback chain `cf-connecting-ip` → `x-forwarded-for` (đầu) → `x-real-ip`.
 * `userAgent`/`requestId`: chỉ để hiển thị + correlation (không index forensic).
 *
 * @param headers - Web `Headers` (`request.headers` / `ctx.headers`) hoặc `undefined`.
 * @returns `{ ip?, userAgent?, requestId? }` — mỗi field `undefined` nếu thiếu.
 */
function httpActorFields(headers: Headers | undefined): {
  ip?: string;
  userAgent?: string;
  requestId?: string;
} {
  const http = extractHttpContextFromWebHeaders(headers);
  return {
    ip: extractClientIpFromWebHeaders(headers),
    userAgent: http.userAgent,
    requestId: http.requestId,
  };
}

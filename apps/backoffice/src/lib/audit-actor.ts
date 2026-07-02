import type { RouteSession } from "@megawin/next/server";
import type { AuditActor } from "@megawin/audit/logger";
import { AuditActorType } from "@megawin/audit/entities";
import { AccountType, type AccountRole } from "@megawin/identity/entities";

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
 * Map session user (better-auth) → {@link AuditActor} chuẩn cho use-case.
 *
 * Adapter layer: nằm ở app (BO), KHÔNG ở `@megawin/audit` — tránh audit phụ
 * thuộc tầng vận chuyển (better-auth/RouteSession). Use-case nhận `AuditActor`
 * phẳng, không biết session đến từ đâu.
 *
 * `actorType` map từ `session.user.accountType` qua {@link ACCOUNT_TO_ACTOR_TYPE}
 * (KHÔNG hardcode, KHÔNG cast mù). Giá trị lạ ngoài `AccountType` → fallback
 * `unknown` (cờ forensic — query ra để biết cần sửa adapter; không nên xảy ra với
 * session hợp lệ).
 * `tenantId` thường rỗng với company staff (action toàn cục), giữ nguyên session.
 *
 * @example
 * ```ts
 * .handler(async ({ session, body, params }) => {
 *   const actor = actorFromSession(session!);
 *   return useCase.run({ ...input, actor });
 * });
 * ```
 */
export function actorFromSession(session: RouteSession<AccountRole>): AuditActor {
  const u = session.user;
  return {
    // accountId là id nghiệp vụ (ULID/UUID portable); fallback username nếu thiếu.
    id: u.accountId || u.username,
    // Map tường minh accountType → AuditActorType; giá trị lạ → unknown (cờ forensic).
    type: ACCOUNT_TO_ACTOR_TYPE[u.accountType as AccountType] ?? AuditActorType.Unknown,
    // Nhãn hiển thị: ưu tiên username → email → accountId → id.
    name: u.username || u.accountId,
    roles: u.roles,
    tenantId: u.tenantId ?? "",
  };
}

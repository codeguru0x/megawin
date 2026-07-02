import { record, type AuditActor } from "@megawin/audit/logger";
import {
  AUDIT_ACTIONS,
  AuditCategory,
  AuditTargetType,
  type AuditHttpContext,
} from "@megawin/audit/entities";

/**
 * Identity account audit-log helpers — nhóm free functions ghi audit log cho các
 * thao tác QUẢN TRỊ tài khoản (đặt lại mật khẩu, đổi mật khẩu của mình, bật/tắt
 * MFA).
 *
 * Phân tầng giống game `services/audit-log.ts`: `@megawin/audit/logger` cung cấp
 * `record()` (low-level, generic). Module này là tầng high-level của domain
 * identity — đóng băng `category=account` + `targetType=account` cho từng action.
 * KHÔNG truyền `game` (các thao tác này không thuộc game cụ thể → logger tự điền
 * sentinel `""`).
 *
 * Free functions stateless — KHÔNG class, KHÔNG state, KHÔNG DI. Mọi function
 * fire-and-forget (gọi `record()`) — audit fail không bao giờ làm hỏng nghiệp vụ.
 *
 * Phân biệt SELF vs CROSS (theo yêu cầu nghiệp vụ):
 * - CROSS ({@link auditSetAccountPassword}): actor ≠ target. Ghi đầy đủ actor
 *   (caller) + target (tài khoản bị tác động).
 * - SELF ({@link auditChangeOwnPassword} / {@link auditEnableMfa} /
 *   {@link auditDisableMfa}): actor = target. CHỈ ghi SỰ KIỆN đã xảy ra, KHÔNG
 *   ghi `changes` chi tiết nhạy cảm (password/secret/TOTP).
 */

/** Spread 5 field actor → DRY giữa các audit function (giống game). */
function actorFields(a: AuditActor) {
  return {
    actorId: a.id,
    actorType: a.type,
    actorName: a.name,
    actorRoles: a.roles,
    tenantId: a.tenantId,
  };
}

/**
 * [CROSS] Audit 1 tài khoản đặt lại mật khẩu CHO tài khoản khác (Staff/Admin đổi
 * pass tài khoản khác).
 *
 * Ghi đầy đủ: `actor` = caller, `targetId` = username tài khoản bị đặt lại pass.
 * `changes.after` chỉ ghi cờ `passwordReset: true` — TUYỆT ĐỐI KHÔNG ghi giá trị
 * mật khẩu.
 *
 * @param args.actor - Caller thực hiện (đã normalize ở route qua actorFromSession).
 * @param args.targetUsername - Username tài khoản bị đặt lại mật khẩu.
 * @param args.meta - Context HTTP (ip/userAgent/requestId) nếu có.
 */
export function auditSetAccountPassword(args: {
  actor: AuditActor;
  targetUsername: string;
  meta?: AuditHttpContext;
}): void {
  record({
    ...actorFields(args.actor),
    action: AUDIT_ACTIONS.account.setPassword,
    category: AuditCategory.Account,
    targetType: AuditTargetType.Account,
    targetId: args.targetUsername,
    targetLabel: `Tài khoản ${args.targetUsername}`,
    metadata: { http: args.meta },
  });
}

/**
 * [SELF] Audit user đổi mật khẩu CỦA CHÍNH MÌNH.
 *
 * Chỉ ghi sự kiện "đã đổi mật khẩu" — KHÔNG ghi mật khẩu cũ/mới. `actor` = target
 * nên `targetId` = `actor.id`.
 *
 * @param args.actor - Chủ thể (chính là chủ tài khoản).
 * @param args.meta - Context HTTP nếu có.
 */
export function auditChangeOwnPassword(args: { actor: AuditActor; meta?: AuditHttpContext }): void {
  record({
    ...actorFields(args.actor),
    action: AUDIT_ACTIONS.account.changeOwnPassword,
    category: AuditCategory.Account,
    targetType: AuditTargetType.Account,
    targetId: args.actor.id,
    metadata: { http: args.meta },
  });
}

/**
 * [SELF] Audit user BẬT MFA cho chính mình (verify-and-enable thành công).
 *
 * Chỉ ghi sự kiện — KHÔNG ghi secret/TOTP. `actor` = target.
 *
 * @param args.actor - Chủ thể (chính là chủ tài khoản).
 * @param args.meta - Context HTTP nếu có.
 */
export function auditEnableMfa(args: { actor: AuditActor; meta?: AuditHttpContext }): void {
  record({
    ...actorFields(args.actor),
    action: AUDIT_ACTIONS.account.enableMfa,
    category: AuditCategory.Account,
    targetType: AuditTargetType.Account,
    targetId: args.actor.id,
    metadata: { http: args.meta },
  });
}

/**
 * [SELF] Audit user TẮT MFA cho chính mình.
 *
 * Chỉ ghi sự kiện — KHÔNG ghi password/TOTP đã dùng để xác thực. `actor` = target.
 *
 * @param args.actor - Chủ thể (chính là chủ tài khoản).
 * @param args.meta - Context HTTP nếu có.
 */
export function auditDisableMfa(args: { actor: AuditActor; meta?: AuditHttpContext }): void {
  record({
    ...actorFields(args.actor),
    action: AUDIT_ACTIONS.account.disableMfa,
    category: AuditCategory.Account,
    targetType: AuditTargetType.Account,
    targetId: args.actor.id,
    metadata: { http: args.meta },
  });
}

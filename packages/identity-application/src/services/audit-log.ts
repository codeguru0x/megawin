import { AUDIT_ACTIONS, AuditCategory, AuditTargetType } from "@megawin/audit/entities";
import { type AuditActor, record } from "@megawin/audit/logger";

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

/** Spread 5 field actor + ip → DRY giữa các audit function (giống game). */
function actorFields(a: AuditActor) {
  return {
    actorId: a.id,
    actorType: a.type,
    actorName: a.name,
    actorRoles: a.roles,
    tenantId: a.tenantId,
    ip: a.ip,
  };
}

/**
 * Spread HTTP context KHÔNG index (`userAgent`/`requestId`) — OPT-IN per-action.
 *
 * Tách khỏi {@link actorFields}: KHÔNG mọi action đều cần thiết bị/correlation.
 * Chỉ action mà HTTP context có giá trị forensic (login/logout) mới spread
 * `...httpFields(actor)` để tránh nhồi rác vào mọi record. Bỏ field `undefined`
 * là việc của logger (`dropUndefined`).
 */
function httpFields(a: AuditActor) {
  return {
    userAgent: a.userAgent,
    requestId: a.requestId,
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
 * @param args.actor - Caller thực hiện (đã normalize ở route qua actorFromSession,
 *   IP forensic gắn sẵn trong actor).
 * @param args.targetUsername - Username tài khoản bị đặt lại mật khẩu.
 */
export function auditSetAccountPassword(args: { actor: AuditActor; targetUsername: string }): void {
  record({
    ...actorFields(args.actor),
    action: AUDIT_ACTIONS.account.setPassword,
    category: AuditCategory.Account,
    targetType: AuditTargetType.Account,
    targetId: args.targetUsername,
    targetLabel: `Tài khoản ${args.targetUsername}`,
  });
}

/**
 * [SELF] Audit user đổi mật khẩu CỦA CHÍNH MÌNH.
 *
 * Chỉ ghi sự kiện "đã đổi mật khẩu" — KHÔNG ghi mật khẩu cũ/mới. `actor` = target
 * nên `targetId` = `actor.id`.
 *
 * @param args.actor - Chủ thể (chính là chủ tài khoản), IP forensic gắn sẵn.
 */
export function auditChangeOwnPassword(args: { actor: AuditActor }): void {
  record({
    ...actorFields(args.actor),
    action: AUDIT_ACTIONS.account.changeOwnPassword,
    category: AuditCategory.Account,
    targetType: AuditTargetType.Account,
    targetId: args.actor.id,
    // SELF: actor = target → hiển thị username thay vì accountId khó đọc.
    targetLabel: args.actor.name,
  });
}

/**
 * [SELF] Audit user BẬT MFA cho chính mình (verify-and-enable thành công).
 *
 * Chỉ ghi sự kiện — KHÔNG ghi secret/TOTP. `actor` = target.
 *
 * @param args.actor - Chủ thể (chính là chủ tài khoản), IP forensic gắn sẵn.
 */
export function auditEnableMfa(args: { actor: AuditActor }): void {
  record({
    ...actorFields(args.actor),
    action: AUDIT_ACTIONS.account.enableMfa,
    category: AuditCategory.Account,
    targetType: AuditTargetType.Account,
    targetId: args.actor.id,
    // SELF: actor = target → hiển thị username thay vì accountId khó đọc.
    targetLabel: args.actor.name,
  });
}

/**
 * [SELF] Audit user TẮT MFA cho chính mình.
 *
 * Chỉ ghi sự kiện — KHÔNG ghi password/TOTP đã dùng để xác thực. `actor` = target.
 *
 * @param args.actor - Chủ thể (chính là chủ tài khoản), IP forensic gắn sẵn.
 */
export function auditDisableMfa(args: { actor: AuditActor }): void {
  record({
    ...actorFields(args.actor),
    action: AUDIT_ACTIONS.account.disableMfa,
    category: AuditCategory.Account,
    targetType: AuditTargetType.Account,
    targetId: args.actor.id,
    // SELF: actor = target → hiển thị username thay vì accountId khó đọc.
    targetLabel: args.actor.name,
  });
}

/**
 * Audit đăng nhập thành công — CHỈ cho tài khoản công ty (`company`) và đại lý
 * (`agent`). KHÔNG ghi cho `player` (volume lớn → rác dữ liệu audit).
 *
 * `actor` = target (tự đăng nhập chính mình). Chỉ ghi sự kiện + IP + HTTP context
 * (userAgent/requestId để nhận diện thiết bị), KHÔNG ghi token/credential. Caller
 * (auth hook) tự lọc actorType trước khi gọi.
 *
 * @param args.actor - Chủ thể vừa đăng nhập (đã normalize, IP + HTTP context gắn sẵn).
 */
export function auditLogin(args: { actor: AuditActor }): void {
  record({
    ...actorFields(args.actor),
    ...httpFields(args.actor),
    action: AUDIT_ACTIONS.auth.login,
    category: AuditCategory.Auth,
    targetType: AuditTargetType.Account,
    targetId: args.actor.id,
    // SELF: actor = target → hiển thị username thay vì accountId khó đọc.
    targetLabel: args.actor.name,
  });
}

/**
 * Audit đăng xuất — CHỈ cho tài khoản công ty (`company`) và đại lý (`agent`).
 * KHÔNG ghi cho `player`. `actor` = target. Ghi kèm HTTP context (userAgent/requestId).
 *
 * @param args.actor - Chủ thể vừa đăng xuất (đã normalize, IP + HTTP context gắn sẵn).
 */
export function auditLogout(args: { actor: AuditActor }): void {
  record({
    ...actorFields(args.actor),
    ...httpFields(args.actor),
    action: AUDIT_ACTIONS.auth.logout,
    category: AuditCategory.Auth,
    targetType: AuditTargetType.Account,
    targetId: args.actor.id,
    // SELF: actor = target → hiển thị username thay vì accountId khó đọc.
    targetLabel: args.actor.name,
  });
}

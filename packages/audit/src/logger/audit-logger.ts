import { pruneUndefined } from "@megawin/shared/utils";

import { AuditLogRepository } from "../infras/repos";
import type { AuditHttpContext, AuditLogInsertDoc, AuditMetadata } from "../entities";
import { AuditStatus } from "../entities";

import type { AuditEventInput } from "./types";

/**
 * Logger audit — module functions thuần, KHÔNG class/instance.
 *
 * Logger không có state cấu hình nên không cần khởi tạo object: import trực tiếp
 * `record` / `recordAndWait`. Repo Mongo lazy-init ở module scope (chỉ tạo lần
 * đầu ghi) → import package không mở connection, không tốn gì nếu request không
 * phát sinh audit.
 *
 * @example
 * ```ts
 * import { record, AUDIT_ACTIONS } from "@megawin/audit/logger";
 *
 * record({
 *   actorId: actor.id, actorType: actor.type, actorName: actor.name,
 *   actorRoles: actor.roles, tenantId: actor.tenantId,
 *   action: AUDIT_ACTIONS.draw.void, category: "draw", game: "keno",
 *   targetType: "draw", targetId: "2026-03-07.095",
 *   targetLabel: "Kỳ 2026-03-07.095",
 *   metadata: { extra: { reason: "Sai kết quả Vietlott" } },
 * });
 * ```
 */

/** Repo singleton module-scope — lazy, chỉ tạo lần đầu thực sự ghi. */
let repo: AuditLogRepository | null = null;

function getRepo(): AuditLogRepository {
  if (!repo) repo = new AuditLogRepository();
  return repo;
}

/**
 * Gom HTTP context của actor (userAgent/requestId/… phẳng ở input) thành object
 * `http`, chỉ giữ field có giá trị; `undefined` nếu không field nào có giá trị.
 *
 * Thêm field HTTP mới (vd `deviceId`) chỉ cần thêm field vào `AuditEventInput` +
 * 1 dòng trong candidate dưới đây — `pruneUndefined` (`@megawin/shared/utils`) tự
 * loại field trống, không phải sửa điều kiện hard-code.
 */
function buildHttpContext(input: AuditEventInput): AuditHttpContext | undefined {
  return pruneUndefined<AuditHttpContext>({
    userAgent: input.userAgent,
    requestId: input.requestId,
  });
}

/**
 * Gộp HTTP context vào `metadata.http`, giữ nguyên `worker`/`extra` caller đã truyền.
 *
 * Trả `undefined` khi KHÔNG có `metadata` lẫn HTTP context → không ghi object
 * `metadata` rỗng vào DB (doc gọn). `http` chỉ gắn khi có ≥1 field giá trị.
 */
function buildMetadata(input: AuditEventInput): AuditMetadata | undefined {
  const http = buildHttpContext(input);
  if (!input.metadata && !http) return undefined;
  return { ...input.metadata, ...(http && { http }) };
}

/**
 * Build `AuditLogInsertDoc` từ input — điền field hệ thống.
 *
 * `ts` mặc định `new Date()` (UTC). `status` mặc định `success`. `game` mặc định
 * `""` (không thuộc game cụ thể). `ip` mặc định `""` (không bắt được) — tầng lưu
 * trữ luôn có sentinel để index đồng nhất. HTTP context (userAgent/requestId)
 * KHÔNG sentinel (không index) — gom vào `metadata.http` qua {@link buildMetadata}.
 */
function toDoc(input: AuditEventInput): AuditLogInsertDoc {
  return {
    ts: input.ts ?? new Date(),
    actorId: input.actorId,
    actorType: input.actorType,
    actorName: input.actorName,
    actorRoles: input.actorRoles,
    tenantId: input.tenantId,
    ip: input.ip ?? "",
    action: input.action,
    category: input.category,
    game: input.game ?? "",
    targetType: input.targetType,
    targetId: input.targetId,
    targetLabel: input.targetLabel,
    status: input.status ?? AuditStatus.Success,
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
    changes: input.changes,
    metadata: buildMetadata(input),
  };
}

/**
 * Ghi audit log có await — throw nếu insert lỗi.
 *
 * Chỉ dùng khi caller bắt buộc xác nhận log đã ghi (test/compliance).
 *
 * @returns `id` (`_id` Mongo dạng string) của record vừa ghi.
 */
export async function recordAndWait(input: AuditEventInput): Promise<string> {
  return await getRepo().insertAudit(toDoc(input));
}

/**
 * Ghi audit log không chặn nghiệp vụ — nuốt mọi lỗi (chỉ log ra console).
 *
 * KHÔNG `await` ở business flow: gọi rồi tiếp tục. Audit fail = mất 1 record,
 * không bao giờ rollback nghiệp vụ.
 */
export function record(input: AuditEventInput): void {
  void recordAndWait(input).catch((err) => {
    // Audit là phụ trợ: lỗi chỉ log, không ném ra ngoài.
    console.error("[audit] failed to record audit log:", err, {
      action: input.action,
      targetId: input.targetId,
    });
  });
}

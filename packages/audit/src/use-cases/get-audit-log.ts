/**
 * BO use case — lấy chi tiết 1 audit record theo `id`.
 *
 * Dùng cho drawer chi tiết trên trang "Lịch sử thao tác": hiển thị đầy đủ
 * `changes` (diff before/after) + `metadata` (http/worker/extra) mà list view
 * không tải. Không tìm thấy → 404.
 */

import { UseCase } from "@megawin/app-core/use-cases";
import { AppException } from "@megawin/shared/errors";

import type { AuditLogEntity } from "../entities";
import { AuditTargetType, SELF_ACTIVITY_ACTION_SET, SELF_ACTIVITY_TARGET_ACTION_SET } from "../entities";
import { AuditLogRepository } from "../infras/repos";

/** Input lấy chi tiết audit — chỉ cần `id` (`_id` hex string). */
export interface GetAuditLogInput {
  /** `_id` Mongo dạng hex string. */
  id: string;
  /**
   * Nếu set → self-scope cho endpoint "Nhật ký của tôi" (`/api/me/audit-logs/{id}`):
   * chỉ trả record khi CẢ HAI đúng, ngược lại 404 (không lộ existence):
   *
   * 1. `action ∈ SELF_ACTIVITY_ACTIONS` — record thuộc nhóm security SELF.
   *    Ngăn user mở chi tiết hành động nghiệp vụ dù đoán đúng id.
   * 2. User là **actor** (`actorId === accountId`). Chiều "user là target" chỉ
   *    mở cho whitelist hẹp `SELF_ACTIVITY_TARGET_ACTIONS` (hiện rỗng) — tránh lộ
   *    actor/IP của người khác trong CROSS action.
   *
   * Route truyền `accountId` của session vào. Bỏ trống → không kiểm (trang admin
   * xem mọi record). `""` (session thiếu accountId) → không khớp → 404.
   */
  requireSelfScope?: string;
}

/**
 * Lấy chi tiết 1 audit record theo `_id`.
 *
 * Throw {@link AppException} `NOT_FOUND` (404) nếu id không tồn tại — record
 * audit không bao giờ bị update/delete (trừ TTL), nên miss = id sai hoặc đã hết
 * hạn 90 ngày.
 *
 * Nếu `requireSelfScope` được truyền, chỉ trả record thuộc nhóm security SELF mà
 * user là actor (hoặc target nếu action nằm trong whitelist target); còn lại
 * throw 404 (không phân biệt "không tồn tại" vs "không phải của bạn").
 */
export class GetAuditLogUseCase extends UseCase<GetAuditLogInput, AuditLogEntity> {
  private readonly repo = new AuditLogRepository();

  protected async execute(input: GetAuditLogInput): Promise<AuditLogEntity> {
    const log = await this.repo.getById(input.id);
    if (!log) {
      throw AppException.notFound("Không tìm thấy audit log");
    }
    // Self-scoped: record ngoài phạm vi coi như không tồn tại (không lộ existence).
    if (input.requireSelfScope !== undefined && !this.isSelfVisible(log, input.requireSelfScope)) {
      throw AppException.notFound("Không tìm thấy audit log");
    }
    return log;
  }

  /**
   * Record có được phép hiện cho `accountId` ở trang "Nhật ký của tôi" không.
   *
   * Mirror điều kiện list ({@link AuditLogFilter.selfScope}): action thuộc nhóm
   * security SELF, VÀ user là actor. Chiều "user là target" chỉ áp dụng cho
   * whitelist hẹp {@link SELF_ACTIVITY_TARGET_ACTION_SET} (hiện rỗng → chỉ actor).
   */
  private isSelfVisible(log: AuditLogEntity, accountId: string): boolean {
    if (!SELF_ACTIVITY_ACTION_SET.has(log.action)) return false;
    if (log.actorId === accountId) return true;
    // Chiều target chỉ mở cho CROSS action đã whitelist (không lộ actor/IP tuỳ tiện).
    return (
      SELF_ACTIVITY_TARGET_ACTION_SET.has(log.action) &&
      log.targetType === AuditTargetType.Account &&
      log.targetId === accountId
    );
  }
}

/**
 * Types cho {@link AuditLogRepository}.
 *
 * Tách khỏi repo class để use-case / UI layer import type độc lập (không kéo
 * theo mongo client / mapper).
 */

import type { CursorPage } from "@megawin/data/mongo";

import type { AuditAction, AuditActorType, AuditCategory, AuditStatus, AuditTargetType } from "../../../entities";

/**
 * Filter list audit log — mọi field optional, combine theo `$and`.
 *
 * `from`/`to` đã được convert sang **UTC boundary** ở Zod schema tại route
 * (qua `toVNStartOfDay`/`toVNEndOfDay`). Repo nhận `Date` thuần, không convert thêm.
 */
export interface AuditLogFilter {
  /** Lower bound `ts >= from` (UTC). */
  from?: Date;
  /** Upper bound `ts <= to` (UTC). */
  to?: Date;
  /**
   * Tìm actor theo `actorId` (khớp chính xác) HOẶC `actorName` (chứa, không phân
   * biệt hoa/thường). Phục vụ ô search "Người thực hiện" — user thường nhớ
   * username hơn accountId. Scan giới hạn vì luôn kèm date range (cap 31 ngày).
   */
  actor?: string;
  actorType?: AuditActorType;
  /**
   * Khớp chính xác IP của actor (`AuditLogDoc.ip`). Forensic: "liệt kê mọi hành
   * động phát từ IP X". Dùng index `{ ip: 1, ts: -1 }`.
   */
  ip?: string;
  tenantId?: string;
  /** GameProduct key. */
  game?: string;
  category?: AuditCategory;
  action?: AuditAction;
  targetType?: AuditTargetType;
  /** Id đối tượng — tra "mọi thao tác trên kỳ X / player Y". */
  targetId?: string;
  status?: AuditStatus;
  /**
   * Self-scope cho trang "Nhật ký của tôi" — chỉ trả security event LIÊN QUAN
   * đến 1 tài khoản, KHÔNG cho xem log người khác.
   *
   * Khi set, repo thêm điều kiện `$and`:
   * 1. `action ∈ SELF_ACTIVITY_ACTIONS` — chỉ nhóm auth/account SELF, ẩn hành động nghiệp vụ.
   * 2. `actorId = accountId` — mặc định chỉ chiều SELF (actor = target). Chiều
   *    "mình là target" chỉ bật cho whitelist `SELF_ACTIVITY_TARGET_ACTIONS`
   *    (hiện rỗng → không match qua target, tránh lộ actor/IP CROSS action).
   *
   * Route API tự ép giá trị này từ session → client KHÔNG thể tự truyền accountId
   * khác. `""` (session thiếu accountId) → không khớp record nào (an toàn, trả rỗng).
   */
  selfScope?: string;
}

/**
 * Cursor compound `(ts, _id)` — trỏ tới record cuối của page trước.
 *
 * Truyền qua HTTP dưới dạng 2 query param riêng (`cursorTs` ISO + `cursorId`);
 * Zod schema ở route decode ngược thành object này. `null`/`undefined` = trang đầu.
 */
export interface AuditLogCursor {
  /** `ts` của record cuối page trước (UTC). */
  ts: Date;
  /** `_id` hex string của record cuối page trước — tie-break khi trùng `ts`. */
  id: string;
}

/**
 * Option phân trang cursor-based.
 *
 * Sort chuẩn: `{ ts: -1, _id: -1 }`. KHÔNG có total count (cursor không đếm) —
 * bỏ chi phí `count()` tốn kém trên collection lớn.
 */
export interface AuditLogPageOptions {
  /** Số record / trang. Cap ở use-case layer — repo không tự cap. */
  limit: number;
  /** Cursor page trước. `null`/`undefined` = trang đầu. */
  cursor?: AuditLogCursor | null;
}

/**
 * Output của list cursor — data + cursor cho trang kế.
 *
 * Alias của generic {@link CursorPage} với compound cursor đã serialize sang
 * shape `{ ts: ISO string; id }` để truyền qua HTTP. `nextCursor === null`
 * nghĩa là hết page.
 */
export type AuditLogCursorPage<TData> = CursorPage<TData, { ts: string; id: string }>;

/**
 * BO use case — list audit log ADMIN/STAFF: filter đa chiều + cursor pagination.
 *
 * Dùng cho trang "Lịch sử thao tác" (toàn hệ thống) trong Backoffice. Hỗ trợ:
 * - Filter theo `from/to` (date range đã convert sang UTC boundary ở route).
 * - Filter theo mọi chiều top-level: actor, tenant, game, category, action,
 *   target, status.
 * - Cursor-based pagination `(ts, _id)` — stable khi data insert liên tục.
 *
 * KHÔNG có self-scope: đây là view toàn cục cho admin/staff. Nhật ký cá nhân
 * ("Nhật ký của tôi") tách riêng ở {@link ListMyAuditLogsUseCase} với input hẹp,
 * ép self-scope theo accountId — client không thể mở rộng phạm vi xem log.
 *
 * KISS: mọi parse + validate (date boundary, range cap, limit default, cursor
 * decode) đã làm ở Zod schema tại route. Use-case chỉ map input → filter và gọi
 * repo — không parse, không validate, không throw.
 */

import { UseCase } from "@megawin/app-core/use-cases";

import type {
  AuditAction,
  AuditActorType,
  AuditCategory,
  AuditLogEntity,
  AuditStatus,
  AuditTargetType,
} from "../entities";
import { type AuditLogCursor, type AuditLogFilter, AuditLogRepository } from "../infras/repos";
import { encodeAuditCursor } from "./audit-cursor-codec";

/**
 * 1 trang audit log trả cho FE — `nextCursor` là token **opaque** (base64url).
 *
 * Khác `AuditLogCursorPage` của repo (nextCursor object `{ ts, id }`): use-case
 * encode object → string opaque để client coi cursor là chuỗi mờ, gửi lại verbatim.
 * `null` = hết trang.
 */
export interface AuditLogPage {
  data: AuditLogEntity[];
  nextCursor: string | null;
}

/**
 * Input list audit log — đã được Zod schema ở route parse + validate sạch.
 *
 * `from`/`to` là `Date` UTC boundary (route convert từ `YYYY-MM-DD` giờ VN).
 * `cursor` là object `(ts, id)` (route decode từ 2 query param `cursorTs`/`cursorId`).
 * `limit` luôn có giá trị (route áp default + cap).
 */
export interface ListAuditLogsInput {
  /** Lower bound `ts >= from` (UTC). */
  from?: Date;
  /** Upper bound `ts <= to` (UTC). */
  to?: Date;
  /** Tìm actor theo `actorId` (chính xác) hoặc `actorName` (chứa, không dấu hoa/thường). */
  actor?: string;
  actorType?: AuditActorType;
  /** Khớp chính xác IP actor — tra "mọi thao tác phát từ IP X". */
  ip?: string;
  tenantId?: string;
  /** GameProduct key: keno | bingo18 | ... */
  game?: string;
  category?: AuditCategory;
  action?: AuditAction;
  targetType?: AuditTargetType;
  /** Id đối tượng — tra "mọi thao tác trên kỳ X / player Y". */
  targetId?: string;
  status?: AuditStatus;
  /** Số record / trang — route đã áp default + cap. */
  limit: number;
  /** Cursor trang trước (route decode từ `cursorTs`/`cursorId`). */
  cursor?: AuditLogCursor;
}

/**
 * List audit log cho Backoffice — cursor paginate, newest-first.
 *
 * Map input (đã sạch) → {@link AuditLogFilter} → `repo.listByCursor`. Encode
 * `nextCursor` object `{ ts, id }` → token opaque base64url ({@link AuditLogPage})
 * để FE coi cursor là chuỗi mờ, không parse/sửa được.
 */
export class ListAuditLogsUseCase extends UseCase<ListAuditLogsInput, AuditLogPage> {
  private readonly repo = new AuditLogRepository();

  protected async execute(input: ListAuditLogsInput): Promise<AuditLogPage> {
    const filter: AuditLogFilter = {
      from: input.from,
      to: input.to,
      actor: input.actor,
      actorType: input.actorType,
      ip: input.ip,
      tenantId: input.tenantId,
      game: input.game,
      category: input.category,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      status: input.status,
    };

    const page = await this.repo.listByCursor(filter, {
      limit: input.limit,
      cursor: input.cursor ?? null,
    });

    // Encode nextCursor object → opaque token. Client gửi lại verbatim ở trang kế.
    return { data: page.data, nextCursor: encodeAuditCursor(page.nextCursor) };
  }
}

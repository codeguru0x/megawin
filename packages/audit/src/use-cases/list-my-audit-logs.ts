/**
 * BO use case — "Nhật ký của tôi": self-scoped security activity của 1 tài khoản.
 *
 * Dùng cho trang cá nhân trong Backoffice (menu tài khoản → hoạt động). CHỈ trả
 * nhóm event bảo mật (`SELF_ACTIVITY_ACTIONS` — auth/account) mà user là actor
 * HOẶC target (whitelist). Tách khỏi {@link ListAuditLogsUseCase} (admin/staff)
 * để đóng phạm vi ở TẦNG TYPE: input KHÔNG khai `actor/ip/tenantId/game/category/
 * targetType/targetId` → dù gọi từ đâu cũng không thể mở rộng phạm vi xem log.
 *
 * `accountId` là bắt buộc và luôn được ép thành `selfScope` — route lấy từ session,
 * client KHÔNG truyền được. `""` (session thiếu accountId) → repo trả rỗng (an toàn).
 *
 * KISS: parse + validate (date boundary, range cap, limit, cursor decode) đã làm
 * ở Zod schema tại route. Use-case chỉ map input → filter và gọi repo.
 */

import { NextApiUseCase } from "@megawin/next/server";

import type { AuditAction, AuditStatus } from "../entities";
import { AuditLogRepository, type AuditLogCursor, type AuditLogFilter } from "../infras/repos";
import { encodeAuditCursor } from "./audit-cursor-codec";
import type { AuditLogPage } from "./list-audit-logs";

/**
 * Input "Nhật ký của tôi" — CỐ Ý hẹp: chỉ các chiều có nghĩa cho nhật ký bảo mật
 * cá nhân. Đã được Zod schema ở route parse + validate sạch.
 *
 * KHÔNG có `actor/actorType/ip/tenantId/game/category/targetType/targetId`:
 * self-scope ép theo `accountId`, các chiều nghiệp vụ không áp dụng cho nhóm
 * action security. Type-level chặn mọi nỗ lực mở rộng phạm vi.
 */
export interface ListMyAuditLogsInput {
  /**
   * Tài khoản đang xem nhật ký — route ép từ session (`session.user.accountId`).
   * Bật self-scope: chỉ trả record thuộc `SELF_ACTIVITY_ACTIONS` mà accountId là
   * actor (hoặc target với whitelist). `""` → repo trả rỗng. Client KHÔNG truyền được.
   */
  accountId: string;
  /** Lower bound `ts >= from` (UTC). */
  from?: Date;
  /** Upper bound `ts <= to` (UTC). */
  to?: Date;
  /** Loại action — schema whitelist trong `SELF_ACTIVITY_ACTIONS` (auth/account). */
  action?: AuditAction;
  status?: AuditStatus;
  /** Số record / trang — route đã áp default + cap. */
  limit: number;
  /** Cursor trang trước (route decode từ opaque token). */
  cursor?: AuditLogCursor;
}

/**
 * List "Nhật ký của tôi" — cursor paginate, newest-first, self-scoped.
 *
 * Map input hẹp → {@link AuditLogFilter} với `selfScope = accountId` và các chiều
 * nghiệp vụ luôn `undefined`. Encode `nextCursor` object → token opaque base64url.
 */
export class ListMyAuditLogsUseCase extends NextApiUseCase<ListMyAuditLogsInput, AuditLogPage> {
  private readonly repo = new AuditLogRepository();

  protected async execute(input: ListMyAuditLogsInput): Promise<AuditLogPage> {
    // Chỉ build đúng các chiều được phép; selfScope ép từ accountId server-side.
    // Các field khác (actor/ip/game/…) KHÔNG tồn tại trong input → không thể lọt.
    const filter: AuditLogFilter = {
      from: input.from,
      to: input.to,
      action: input.action,
      status: input.status,
      selfScope: input.accountId,
    };

    const page = await this.repo.listByCursor(filter, {
      limit: input.limit,
      cursor: input.cursor ?? null,
    });

    // Encode nextCursor object → opaque token. Client gửi lại verbatim ở trang kế.
    return { data: page.data, nextCursor: encodeAuditCursor(page.nextCursor) };
  }
}

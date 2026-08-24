/**
 * Tool eve: `searchAuditLogs` — nhật ký thao tác (ai làm gì, lên đối tượng nào, lúc nào, kết quả
 * ra sao) toàn hệ thống — kỳ quay, cấu hình, tài khoản, tài chính, đăng nhập, worker.
 *
 * KHÔNG chạm repo/DB trực tiếp — chỉ gọi qua use-case (`app-use-case-layering.mdc` §3),
 * `ListAuditLogsUseCase` từ `@megawin/audit/use-cases`. Package này CỐ Ý không tự parse/validate
 * ngày hay cursor (KISS — dồn hết vào Zod schema route, xem `audit-logs/_lib/schema.ts`), vì đây
 * là tool AI (không đi qua route đó), `SearchAuditLogsUseCase` orchestrate NGAY trong file tool
 * làm lại ĐÚNG 3 việc route Zod làm: convert `YYYY-MM-DD` → boundary giờ VN, validate range (tối
 * đa 31 ngày, lookback tối đa 90 ngày — TTL Mongo purge sau 90 ngày), decode `cursor` opaque token.
 * Đây KHÔNG phải duplicate validate nghiệp vụ (code-quality-standards.mdc §8) — tool AI là entry
 * point KHÁC route HTTP, không có Zod nào chạy trước nó.
 *
 * `safeRun()` KHÔNG BAO GIỜ throw. `toToolResult` bắt buộc — log entry có nhiều field ISO/Date
 * lẫn nhau; nó cũng log + làm sạch payload khi lỗi (xem `server/ai/tool-result.ts`).
 */

import { UseCase } from "@megawin/app-core/use-cases";
import { AuditActionLabel, AuditActorType, AuditCategory, AuditStatus, AuditTargetType } from "@megawin/audit/entities";
import {
  type AuditLogPage,
  decodeAuditCursor,
  type ListAuditLogsInput,
  ListAuditLogsUseCase,
} from "@megawin/audit/use-cases";
import { AppException } from "@megawin/shared/errors";
import { toVNEndOfDay, toVNStartOfDay } from "@megawin/shared/utils/date";
import { defineTool } from "eve/tools";
import { z } from "zod";

import { toToolResult } from "@/server/ai";

/** Date-only format `YYYY-MM-DD`. */
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
/** Giới hạn range để tránh full-collection scan — cùng ngưỡng với route Zod. */
const MAX_RANGE_DAYS = 31;
/** Retention window — TTL MongoDB purge sau 90 ngày — cùng ngưỡng với route Zod. */
const MAX_LOOKBACK_DAYS = 90;
const MS_PER_DAY = 86_400_000;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;

interface SearchAuditLogsInput {
  from?: string;
  to?: string;
  actor?: string;
  actorType?: AuditActorType;
  ip?: string;
  tenantId?: string;
  game?: string;
  category?: AuditCategory;
  action?: string;
  targetType?: AuditTargetType;
  targetId?: string;
  status?: AuditStatus;
  limit?: number;
  cursor?: string;
}

/** Convert `YYYY-MM-DD` → boundary giờ VN. ISO full (có `T`) → parse thẳng. */
function parseBoundary(raw: string, kind: "start" | "end"): Date {
  if (DATE_ONLY_REGEX.test(raw)) {
    return kind === "start" ? toVNStartOfDay(raw) : toVNEndOfDay(raw);
  }
  return new Date(raw);
}

/** Orchestrate parse ngày + validate range + decode cursor trước khi gọi `ListAuditLogsUseCase`. */
class SearchAuditLogsUseCase extends UseCase<SearchAuditLogsInput, AuditLogPage> {
  private readonly list = new ListAuditLogsUseCase();

  protected async execute(input: SearchAuditLogsInput): Promise<AuditLogPage> {
    const from = input.from ? parseBoundary(input.from, "start") : undefined;
    const to = input.to ? parseBoundary(input.to, "end") : undefined;

    if (from && Number.isNaN(from.getTime())) {
      throw AppException.badRequest("Ngày bắt đầu không hợp lệ.");
    }
    if (to && Number.isNaN(to.getTime())) {
      throw AppException.badRequest("Ngày kết thúc không hợp lệ.");
    }
    if (from && to) {
      this.validateRange(from, to);
    }
    if (from && Date.now() - from.getTime() > MAX_LOOKBACK_DAYS * MS_PER_DAY) {
      throw AppException.badRequest(`Chỉ tra cứu trong ${MAX_LOOKBACK_DAYS} ngày gần nhất.`);
    }

    const listInput: ListAuditLogsInput = {
      from,
      to,
      actor: input.actor,
      actorType: input.actorType,
      ip: input.ip,
      tenantId: input.tenantId,
      game: input.game,
      category: input.category,
      // Model chỉ được truyền action đã tồn tại trong registry — Zod enum ở input schema đã chặn.
      action: input.action as ListAuditLogsInput["action"],
      targetType: input.targetType,
      targetId: input.targetId,
      status: input.status,
      limit: Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT),
      cursor: decodeAuditCursor(input.cursor) ?? undefined,
    };

    return await this.list.run(listInput);
  }

  private validateRange(from: Date, to: Date): void {
    if (from > to) {
      throw AppException.badRequest("`from` phải ≤ `to`.");
    }
    // +1ms bù `toVNEndOfDay` kết thúc 23:59:59.999 → same-day = 1 ngày, không 0.
    const rangeDays = Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY) + 1;
    if (rangeDays > MAX_RANGE_DAYS) {
      throw AppException.badRequest(`Phạm vi tối đa ${MAX_RANGE_DAYS} ngày.`);
    }
  }
}

const useCase = new SearchAuditLogsUseCase();

const actorTypeValues = Object.values(AuditActorType) as [AuditActorType, ...AuditActorType[]];
const categoryValues = Object.values(AuditCategory) as [AuditCategory, ...AuditCategory[]];
const statusValues = Object.values(AuditStatus) as [AuditStatus, ...AuditStatus[]];
const targetTypeValues = Object.values(AuditTargetType) as [AuditTargetType, ...AuditTargetType[]];
// Whitelist action từ registry — model KHÔNG được tự bịa action không tồn tại.
const actionValues = Object.keys(AuditActionLabel) as [string, ...string[]];

export default defineTool({
  description:
    "Nhật ký thao tác (audit log) toàn hệ thống: ai làm gì, lên đối tượng nào, lúc nào, kết quả " +
    "thành công/thất bại. Dùng cho câu hỏi kiểu 'ai huỷ kỳ #095', 'nhân viên nào sửa cấu hình Keno " +
    "hôm qua', 'có ai đăng nhập từ IP lạ không'. Bỏ trống `from`/`to` → log MỚI NHẤT (giới hạn " +
    "`limit`). Có cả hai → phạm vi tối đa 31 ngày, chỉ tra được trong 90 ngày gần nhất (log cũ " +
    "hơn đã bị xoá tự động). `actor` khớp `actorId` (chính xác) HOẶC tên chứa chuỗi đó — không " +
    "cần biết chính xác accountId. `action` PHẢI là 1 trong danh sách đã whitelist (tự phân loại " +
    "theo `category`, KHÔNG tự bịa giá trị lạ). Trang tiếp theo → truyền `cursor` từ `nextCursor` " +
    "của lần gọi trước; `nextCursor: null` là hết trang.",
  inputSchema: z.object({
    from: z.string().optional().describe("Ngày bắt đầu, format YYYY-MM-DD."),
    to: z.string().optional().describe("Ngày kết thúc, format YYYY-MM-DD."),
    actor: z.string().optional().describe("Tìm theo accountId (chính xác) hoặc tên actor (chứa chuỗi)."),
    actorType: z.enum(actorTypeValues).optional().describe("Loại chủ thể: company/agent/player/system."),
    ip: z.string().optional().describe("Khớp chính xác IP thực hiện thao tác."),
    tenantId: z.string().optional().describe("Lọc theo 1 đại lý cụ thể."),
    game: z.string().optional().describe("Lọc theo game key (keno, lotto535, ...)."),
    category: z
      .enum(categoryValues)
      .optional()
      .describe("Nhóm hành động: draw/player/config/auth/account/finance/system/worker."),
    action: z.enum(actionValues).optional().describe("Hành động cụ thể, VD draw.void, config.update_global."),
    targetType: z.enum(targetTypeValues).optional().describe("Loại đối tượng bị tác động."),
    targetId: z.string().optional().describe("ID đối tượng bị tác động (drawId, accountId, ...)."),
    status: z.enum(statusValues).optional().describe("Kết quả: success/failure."),
    limit: z.number().int().positive().max(MAX_LIMIT).optional().describe("Số dòng mỗi trang, mặc định 10, tối đa 20."),
    cursor: z.string().optional().describe("Cursor trang trước, từ `nextCursor` của lần gọi trước."),
  }),
  execute: async (input) => toToolResult(await useCase.safeRun(input), "searchAuditLogs"),
});

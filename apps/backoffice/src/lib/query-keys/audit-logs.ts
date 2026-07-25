import { MODULES } from "./modules";

const MODULE = MODULES.auditLogs;

/** Filter shape cho list audit log — khớp query params của `/api/audit-logs`. */
export interface AuditLogsListFilters {
  from?: string;
  to?: string;
  /** actorId (chính xác) hoặc actorName (chứa) — ô search "Người thực hiện". */
  actor?: string;
  actorType?: string;
  tenantId?: string;
  game?: string;
  category?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  status?: string;
}

/**
 * Query keys cho trang "Lịch sử thao tác" (audit-logs).
 *
 * - `list(filters, cursor)` — 1 trang list cursor-paginated theo filter đa chiều.
 *   `cursor` là token opaque của trang → nằm trong key nên mỗi trang cache riêng,
 *   Prev/Next tức thì không refetch. `cursor` null = trang đầu.
 * - `detail(id)` — chi tiết 1 audit record (drawer).
 */
export const auditLogsKeys = {
  all: [MODULE] as const,

  list: (filters: AuditLogsListFilters, cursor?: string | null) => [MODULE, "list", filters, cursor ?? null] as const,

  detail: (id: string) => [MODULE, "detail", id] as const,
};

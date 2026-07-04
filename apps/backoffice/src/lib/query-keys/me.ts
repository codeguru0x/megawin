import { MODULES } from "./modules";

const MODULE = MODULES.me;

/**
 * Filter shape cho nhật ký bảo mật của chính user — khớp query params
 * `/api/me/audit-logs`.
 *
 * CHỈ gồm chiều có ý nghĩa cho security activity cá nhân: date range, loại action
 * (whitelist auth/account), kết quả. KHÔNG có actor/game/category/target — view
 * self-scoped server-side, và các chiều đó không áp dụng nhóm action security.
 */
export interface MyAuditLogsListFilters {
  from?: string;
  to?: string;
  action?: string;
  status?: string;
}

export const meKeys = {
  /** Invalidate toàn bộ module me */
  all: [MODULE] as const,
  /** Profile của user đang đăng nhập — GET /me/profile */
  profile: [MODULE, "profile"] as const,
  /** Trạng thái MFA của user — GET /me/mfa/status */
  mfaStatus: [MODULE, "mfa", "status"] as const,
  /**
   * 1 trang nhật ký của chính user — GET /api/me/audit-logs, cursor paginate.
   * `cursor` nằm trong key nên mỗi trang cache riêng, Prev/Next tức thì.
   */
  auditLogsList: (filters: MyAuditLogsListFilters, cursor?: string | null) =>
    [MODULE, "audit-logs", "list", filters, cursor ?? null] as const,
  /** Chi tiết 1 bản ghi nhật ký của chính user — GET /api/me/audit-logs/{id}. */
  auditLogDetail: (id: string) => [MODULE, "audit-logs", "detail", id] as const,
};

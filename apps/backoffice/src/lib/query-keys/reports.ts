import { MODULES } from "./modules";

const MODULE = MODULES.reports;

export const reportsKeys = {
  /** Invalidate toàn bộ cache liên quan System Reports */
  all: [MODULE] as const,

  // ─── System Financial Reports ──────────────────────────────────────────────

  /** Tab "Tổng quan ngày" — aggregate by financialDate */
  financialDaily: (params: { from: string; to: string }) => [MODULE, "financial-daily", params] as const,

  /** Inline expand 1 ngày → raw game breakdown docs */
  financialDayBreakdown: (date: string) => [MODULE, "financial-day-breakdown", date] as const,

  /** Tab "Theo game" — aggregate by gameProduct */
  financialByGame: (params: { from: string; to: string }) => [MODULE, "financial-by-game", params] as const,

  /** Tab "Theo đại lý" — aggregate by tenantId */
  financialByTenant: (params: { from: string; to: string; game?: string }) =>
    [MODULE, "financial-by-tenant", params] as const,

  /** Inline expand 1 tenant → game breakdown */
  financialTenantBreakdown: (params: { tenantId: string; from: string; to: string }) =>
    [MODULE, "financial-tenant-breakdown", params] as const,

  // ─── System Outstanding ────────────────────────────────────────────────────

  /** Outstanding toàn hệ thống (live, refetch 60s) */
  outstanding: [MODULE, "outstanding"] as const,
};

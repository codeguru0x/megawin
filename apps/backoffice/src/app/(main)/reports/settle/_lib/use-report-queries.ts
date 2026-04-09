"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@megawin/next/client";
import { reportsKeys } from "@/lib/query-keys";
import type {
  GetDailyOverviewOutput,
  GetGameSummaryOutput,
  GetTenantSummaryOutput,
  GetSystemOutstandingOutput,
} from "@megawin/game-core-application/use-cases/reports";
import type { SystemSettleGameDaily } from "@megawin/game-core/entities";
import type {
  TenantSummaryRow,
  TenantGameBreakdownRow,
} from "@megawin/game-core-application/repos";

// ─── System Financial Queries ─────────────────────────────────────────────────

/**
 * Aggregate daily overview theo date range — tab "Tổng quan ngày".
 * Trả DailyOverviewRow[] (aggregate) khi không có `date`.
 */
export function useSystemDailyOverview(from: string, to: string) {
  return useQuery({
    queryKey: reportsKeys.financialDaily({ from, to }),
    queryFn: () =>
      apiClient
        .get<GetDailyOverviewOutput>("/reports/financial/daily", {
          params: { from, to },
        })
        .then((r) => r.data),
    enabled: !!(from && to),
  });
}

/**
 * Breakdown raw docs cho 1 ngày cụ thể — inline expand row.
 * Truyền `date` param → server trả SystemSettleGameDaily[] (1 row/game).
 */
export function useSystemDayBreakdown(date: string) {
  return useQuery({
    queryKey: reportsKeys.financialDayBreakdown(date),
    queryFn: () =>
      apiClient
        .get<GetDailyOverviewOutput>("/reports/financial/daily", {
          params: { from: date, to: date, date },
        })
        .then((r) => r.data as SystemSettleGameDaily[]),
    enabled: !!date,
  });
}

/**
 * Aggregate theo game trong date range — tab "Theo game".
 */
export function useSystemByGame(from: string, to: string) {
  return useQuery({
    queryKey: reportsKeys.financialByGame({ from, to }),
    queryFn: () =>
      apiClient
        .get<GetGameSummaryOutput>("/reports/financial/by-game", {
          params: { from, to },
        })
        .then((r) => r.data),
    enabled: !!(from && to),
  });
}

/**
 * Aggregate theo tenant trong date range — tab "Theo đại lý".
 * Không có `tenantId` → server trả TenantSummaryRow[] (aggregate, có gameCount).
 * `game` optional: lọc theo 1 game cụ thể, undefined = tất cả.
 */
export function useSystemByTenant(from: string, to: string, game?: string) {
  return useQuery({
    queryKey: reportsKeys.financialByTenant({ from, to }),
    queryFn: () =>
      apiClient
        .get<GetTenantSummaryOutput>("/reports/financial/by-tenant", {
          params: { from, to, ...(game ? { game } : {}) },
        })
        .then((r) => r.data as TenantSummaryRow[]),
    enabled: !!(from && to),
  });
}

/**
 * Breakdown theo game cho 1 tenant cụ thể — aggregate SUM cross-date.
 * Có `tenantId` → server trả TenantGameBreakdownRow[] (1 row/game).
 */
export function useSystemTenantBreakdown(tenantId: string, from: string, to: string) {
  return useQuery({
    queryKey: reportsKeys.financialTenantBreakdown({ tenantId, from, to }),
    queryFn: () =>
      apiClient
        .get<GetTenantSummaryOutput>("/reports/financial/by-tenant", {
          params: { tenantId, from, to },
        })
        .then((r) => r.data as TenantGameBreakdownRow[]),
    enabled: !!(tenantId && from && to),
  });
}

// ─── System Outstanding ───────────────────────────────────────────────────────

/**
 * Danh sách draws đang outstanding trên toàn hệ thống.
 * Tự refresh mỗi 60 giây.
 */
export function useSystemOutstanding() {
  return useQuery({
    queryKey: reportsKeys.outstanding,
    queryFn: () =>
      apiClient.get<GetSystemOutstandingOutput>("/reports/outstanding").then((r) => r.data),
    refetchInterval: 60_000,
  });
}

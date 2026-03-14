"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@megawin/next/client";
import { power655Keys } from "@/lib/query-keys";
import type {
  GetDrawSummaryOutput,
  ListSettleDrawReportsOutput,
  ListDrawTenantsOutput,
  ListTenantReportsOutput,
  ListTenantDrawsOutput,
  ListPlayerBreakdownOutput,
  ListEntryBreakdownOutput,
  GetOutstandingReportsOutput,
  ListVoidReportsOutput,
} from "@megawin/game-power655-application/use-cases/reports";

// ─── By-Draw Queries ──────────────────────────────────────────────────────────

/** KPI summary tổng hợp theo date range — dùng cho KPI strip tab "Theo kỳ quay". */
export function usePower655DrawSummary(from: string, to: string) {
  return useQuery({
    queryKey: power655Keys.reportDrawsSummary({ from, to }),
    queryFn: () =>
      apiClient
        .get<GetDrawSummaryOutput>("/power655/reports/draws/summary", {
          params: { from, to },
        })
        .then((r) => r.data),
    enabled: !!(from && to),
  });
}

/** Danh sách kỳ quay đã settle — paginated. */
export function usePower655DrawList(from: string, to: string, page: number) {
  return useQuery({
    queryKey: power655Keys.reportDraws({ from, to, page }),
    queryFn: () =>
      apiClient.get<ListSettleDrawReportsOutput>("/power655/reports/draws", {
        params: { from, to, page, limit: 20 },
      }),
    enabled: !!(from && to),
  });
}

/** Danh sách tenants cho 1 kỳ quay — drill cấp 2. */
export function usePower655DrawTenants(drawId: string | null) {
  return useQuery({
    queryKey: power655Keys.reportDrawTenants(drawId ?? ""),
    queryFn: () =>
      apiClient
        .get<ListDrawTenantsOutput>(`/power655/reports/draws/${drawId}/tenants`)
        .then((r) => r.data),
    enabled: !!drawId,
  });
}

// ─── By-Tenant Queries ────────────────────────────────────────────────────────

/** Danh sách tenants aggregate theo date range — tab "Theo đại lý". */
export function usePower655TenantList(from: string, to: string) {
  return useQuery({
    queryKey: power655Keys.reportTenants({ from, to }),
    queryFn: () =>
      apiClient
        .get<ListTenantReportsOutput>("/power655/reports/tenants", {
          params: { from, to },
        })
        .then((r) => r.data),
    enabled: !!(from && to),
  });
}

/** Danh sách kỳ quay của 1 tenant — drill cấp 2, paginated. */
export function usePower655TenantDraws(tenantId: string | null, from: string, to: string) {
  return useQuery({
    queryKey: power655Keys.reportTenantDraws({ tenantId: tenantId ?? "", from, to }),
    queryFn: () =>
      apiClient.get<ListTenantDrawsOutput>(`/power655/reports/tenants/${tenantId}/draws`, {
        params: { from, to },
      }),
    enabled: !!(tenantId && from && to),
  });
}

// ─── Deep Drill Queries ───────────────────────────────────────────────────────

/** Danh sách players cho 1 draw × 1 tenant — drill cấp 3. */
export function usePower655Players(drawId: string, tenantId: string | null) {
  return useQuery({
    queryKey: power655Keys.reportPlayers({ drawId, tenantId: tenantId ?? "" }),
    queryFn: () =>
      apiClient
        .get<ListPlayerBreakdownOutput>("/power655/reports/players", {
          params: { drawId, tenantId: tenantId! },
        })
        .then((r) => r.data),
    enabled: !!(drawId && tenantId),
  });
}

/** Danh sách entries của 1 player — drill cấp 4. */
export function usePower655Entries(drawId: string, tenantId: string, accountId: string) {
  return useQuery({
    queryKey: power655Keys.reportEntries({ drawId, tenantId, accountId }),
    queryFn: () =>
      apiClient
        .get<ListEntryBreakdownOutput>("/power655/reports/entries", {
          params: { drawId, tenantId, accountId },
        })
        .then((r) => r.data),
    enabled: !!(drawId && tenantId && accountId),
  });
}

// ─── Outstanding & Void ───────────────────────────────────────────────────────

/** Các kỳ quay đang outstanding (chưa settle). Tự refresh mỗi 60 giây. */
export function usePower655Outstanding() {
  return useQuery({
    queryKey: power655Keys.outstanding,
    queryFn: () =>
      apiClient
        .get<GetOutstandingReportsOutput>("/power655/reports/outstanding")
        .then((r) => r.data),
    refetchInterval: 60_000,
  });
}

/** Danh sách kỳ quay đã void theo date range. */
export function usePower655VoidReports(from: string, to: string) {
  return useQuery({
    queryKey: power655Keys.voidReports({ from, to }),
    queryFn: () =>
      apiClient
        .get<ListVoidReportsOutput>("/power655/reports/void", {
          params: { from, to },
        })
        .then((r) => r.data),
    enabled: !!(from && to),
  });
}

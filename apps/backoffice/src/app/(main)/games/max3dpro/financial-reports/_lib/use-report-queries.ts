"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@megawin/next/client";
import { max3dproKeys } from "@/lib/query-keys";
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
} from "@megawin/game-max3dpro-application/use-cases/reports";

// ─── By-Draw Queries ──────────────────────────────────────────────────────────

/** KPI summary tổng hợp theo date range — dùng cho KPI strip tab "Theo kỳ quay". */
export function useMax3DProDrawSummary(from: string, to: string) {
  return useQuery({
    queryKey: max3dproKeys.reportDrawsSummary({ from, to }),
    queryFn: () =>
      apiClient
        .get<GetDrawSummaryOutput>("/max3dpro/reports/draws/summary", {
          params: { from, to },
        })
        .then((r) => r.data),
    enabled: !!(from && to),
  });
}

/** Danh sách kỳ quay đã settle — paginated. */
export function useMax3DProDrawList(from: string, to: string, page: number) {
  return useQuery({
    queryKey: max3dproKeys.reportDraws({ from, to, page }),
    queryFn: () =>
      apiClient.get<ListSettleDrawReportsOutput>("/max3dpro/reports/draws", {
        params: { from, to, page, limit: 20 },
      }),
    enabled: !!(from && to),
  });
}

/** Danh sách tenants cho 1 kỳ quay — drill cấp 2. */
export function useMax3DProDrawTenants(drawId: string | null) {
  return useQuery({
    queryKey: max3dproKeys.reportDrawTenants(drawId ?? ""),
    queryFn: () =>
      apiClient
        .get<ListDrawTenantsOutput>(`/max3dpro/reports/draws/${drawId}/tenants`)
        .then((r) => r.data),
    enabled: !!drawId,
  });
}

// ─── By-Tenant Queries ────────────────────────────────────────────────────────

/** Danh sách tenants aggregate theo date range — tab "Theo đại lý". */
export function useMax3DProTenantList(from: string, to: string) {
  return useQuery({
    queryKey: max3dproKeys.reportTenants({ from, to }),
    queryFn: () =>
      apiClient
        .get<ListTenantReportsOutput>("/max3dpro/reports/tenants", {
          params: { from, to },
        })
        .then((r) => r.data),
    enabled: !!(from && to),
  });
}

/** Danh sách kỳ quay của 1 tenant — drill cấp 2, paginated. */
export function useMax3DProTenantDraws(tenantId: string | null, from: string, to: string) {
  return useQuery({
    queryKey: max3dproKeys.reportTenantDraws({ tenantId: tenantId ?? "", from, to }),
    queryFn: () =>
      apiClient.get<ListTenantDrawsOutput>(`/max3dpro/reports/tenants/${tenantId}/draws`, {
        params: { from, to },
      }),
    enabled: !!(tenantId && from && to),
  });
}

// ─── Deep Drill Queries ───────────────────────────────────────────────────────

/** Danh sách players cho 1 draw × 1 tenant — drill cấp 3. */
export function useMax3DProPlayers(drawId: string, tenantId: string | null) {
  return useQuery({
    queryKey: max3dproKeys.reportPlayers({ drawId, tenantId: tenantId ?? "" }),
    queryFn: () =>
      apiClient
        .get<ListPlayerBreakdownOutput>("/max3dpro/reports/players", {
          params: { drawId, tenantId: tenantId! },
        })
        .then((r) => r.data),
    enabled: !!(drawId && tenantId),
  });
}

/** Danh sách entries của 1 player — drill cấp 4. */
export function useMax3DProEntries(drawId: string, tenantId: string, accountId: string) {
  return useQuery({
    queryKey: max3dproKeys.reportEntries({ drawId, tenantId, accountId }),
    queryFn: () =>
      apiClient
        .get<ListEntryBreakdownOutput>("/max3dpro/reports/entries", {
          params: { drawId, tenantId, accountId },
        })
        .then((r) => r.data),
    enabled: !!(drawId && tenantId && accountId),
  });
}

// ─── Outstanding & Void ───────────────────────────────────────────────────────

/** Các kỳ quay đang outstanding (chưa settle). Tự refresh mỗi 60 giây. */
export function useMax3DProOutstanding() {
  return useQuery({
    queryKey: max3dproKeys.outstanding,
    queryFn: () =>
      apiClient
        .get<GetOutstandingReportsOutput>("/max3dpro/reports/outstanding")
        .then((r) => r.data),
    refetchInterval: 60_000,
  });
}

/** Danh sách kỳ quay đã void theo date range. */
export function useMax3DProVoidReports(from: string, to: string) {
  return useQuery({
    queryKey: max3dproKeys.voidReports({ from, to }),
    queryFn: () =>
      apiClient
        .get<ListVoidReportsOutput>("/max3dpro/reports/void", {
          params: { from, to },
        })
        .then((r) => r.data),
    enabled: !!(from && to),
  });
}

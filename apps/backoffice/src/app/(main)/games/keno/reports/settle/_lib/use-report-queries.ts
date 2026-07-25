"use client";

import type {
  GetDrawSummaryOutput,
  GetOutstandingReportsOutput,
  ListDrawTenantsOutput,
  ListEntryBreakdownOutput,
  ListOutstandingDrawTenantsOutput,
  ListOutstandingPlayerEntriesOutput,
  ListOutstandingTenantPlayersOutput,
  ListPlayerBreakdownOutput,
  ListSettleDrawReportsOutput,
  ListTenantDrawsOutput,
  ListTenantReportsOutput,
  ListVoidReportsOutput,
} from "@megawin/game-keno-application/use-cases/reports";
import { apiClient } from "@megawin/next/client";
import { useQuery } from "@tanstack/react-query";

import { kenoKeys } from "@/lib/query-keys";

// ─── By-Draw Queries ──────────────────────────────────────────────────────────

/** KPI summary tổng hợp theo date range — dùng cho KPI strip tab "Theo kỳ quay". */
export function useKenoDrawSummary(from: string, to: string) {
  return useQuery({
    queryKey: kenoKeys.reportDrawsSummary({ from, to }),
    queryFn: () =>
      apiClient
        .get<GetDrawSummaryOutput>("/keno/reports/draws/summary", {
          params: { from, to },
        })
        .then((r) => r.data),
    enabled: !!(from && to),
  });
}

/** Danh sách kỳ quay đã settle — paginated. */
export function useKenoDrawList(from: string, to: string, page: number) {
  return useQuery({
    queryKey: kenoKeys.reportDraws({ from, to, page }),
    queryFn: () =>
      apiClient.get<ListSettleDrawReportsOutput>("/keno/reports/draws", {
        params: { from, to, page, limit: 20 },
      }),
    enabled: !!(from && to),
  });
}

/** Danh sách tenants cho 1 kỳ quay — drill cấp 2. */
export function useKenoDrawTenants(drawId: string | null) {
  return useQuery({
    queryKey: kenoKeys.reportDrawTenants(drawId ?? ""),
    queryFn: () => apiClient.get<ListDrawTenantsOutput>(`/keno/reports/draws/${drawId}/tenants`).then((r) => r.data),
    enabled: !!drawId,
  });
}

// ─── By-Tenant Queries ────────────────────────────────────────────────────────

/** Danh sách tenants aggregate theo date range — tab "Theo đại lý". */
export function useKenoTenantList(from: string, to: string) {
  return useQuery({
    queryKey: kenoKeys.reportTenants({ from, to }),
    queryFn: () =>
      apiClient
        .get<ListTenantReportsOutput>("/keno/reports/tenants", {
          params: { from, to },
        })
        .then((r) => r.data),
    enabled: !!(from && to),
  });
}

/** Danh sách kỳ quay của 1 tenant — drill cấp 2, paginated. */
export function useKenoTenantDraws(tenantId: string | null, from: string, to: string) {
  return useQuery({
    queryKey: kenoKeys.reportTenantDraws({ tenantId: tenantId ?? "", from, to }),
    queryFn: () =>
      apiClient.get<ListTenantDrawsOutput>(`/keno/reports/tenants/${tenantId}/draws`, {
        params: { from, to },
      }),
    enabled: !!(tenantId && from && to),
  });
}

// ─── Deep Drill Queries ───────────────────────────────────────────────────────

/** Danh sách players cho 1 draw × 1 tenant — drill cấp 3. */
export function useKenoPlayers(drawId: string, tenantId: string | null) {
  return useQuery({
    queryKey: kenoKeys.reportPlayers({ drawId, tenantId: tenantId ?? "" }),
    queryFn: () =>
      apiClient
        .get<ListPlayerBreakdownOutput>("/keno/reports/players", {
          params: { drawId, tenantId: tenantId! },
        })
        .then((r) => r.data),
    enabled: !!(drawId && tenantId),
  });
}

/** Danh sách entries của 1 player — drill cấp 4. */
export function useKenoEntries(drawId: string, tenantId: string, accountId: string) {
  return useQuery({
    queryKey: kenoKeys.reportEntries({ drawId, tenantId, accountId }),
    queryFn: () =>
      apiClient
        .get<ListEntryBreakdownOutput>("/keno/reports/entries", {
          params: { drawId, tenantId, accountId },
        })
        .then((r) => r.data),
    enabled: !!(drawId && tenantId && accountId),
  });
}

// ─── Outstanding & Void ───────────────────────────────────────────────────────

/** Các kỳ quay đang outstanding (chưa settle). Tự refresh mỗi 60 giây. */
export function useKenoOutstanding() {
  return useQuery({
    queryKey: kenoKeys.outstandingDraws,
    queryFn: () => apiClient.get<GetOutstandingReportsOutput>("/keno/reports/outstanding").then((r) => r.data),
    refetchInterval: 60_000,
  });
}

/** Tenant breakdown của 1 draw outstanding — drill cấp 2. */
export function useKenoOutstandingDrawTenants(drawId: string | null) {
  return useQuery({
    queryKey: kenoKeys.outstandingTenants(drawId ?? ""),
    queryFn: () =>
      apiClient
        .get<ListOutstandingDrawTenantsOutput>(`/keno/reports/outstanding/draws/${drawId}/tenants`)
        .then((r) => r.data),
    enabled: !!drawId,
  });
}

/** Player breakdown của 1 draw × 1 tenant outstanding — drill cấp 3. */
export function useKenoOutstandingTenantPlayers(drawId: string, tenantId: string | null) {
  return useQuery({
    queryKey: kenoKeys.outstandingPlayers({ drawId, tenantId: tenantId ?? "" }),
    queryFn: () =>
      apiClient
        .get<ListOutstandingTenantPlayersOutput>(
          `/keno/reports/outstanding/draws/${drawId}/tenants/${tenantId}/players`,
        )
        .then((r) => r.data),
    enabled: !!(drawId && tenantId),
  });
}

/** Entries outstanding của 1 player trong draw × tenant — drill cấp 4. */
export function useKenoOutstandingPlayerEntries(drawId: string, tenantId: string, accountId: string | null) {
  return useQuery({
    queryKey: kenoKeys.outstandingEntries({
      drawId,
      tenantId,
      accountId: accountId ?? "",
    }),
    queryFn: () =>
      apiClient
        .get<ListOutstandingPlayerEntriesOutput>(
          `/keno/reports/outstanding/draws/${drawId}/tenants/${tenantId}/players/${accountId}/entries`,
        )
        .then((r) => r.data),
    enabled: !!(drawId && tenantId && accountId),
  });
}

/** Danh sách kỳ quay đã void theo date range. */
export function useKenoVoidReports(from: string, to: string) {
  return useQuery({
    queryKey: kenoKeys.voidReports({ from, to }),
    queryFn: () =>
      apiClient
        .get<ListVoidReportsOutput>("/keno/reports/void", {
          params: { from, to },
        })
        .then((r) => r.data),
    enabled: !!(from && to),
  });
}

/** Tenant breakdown cho 1 draw void. Drill cấp 2. */
export function useKenoVoidDrawTenants(drawId: string | null) {
  return useQuery({
    queryKey: kenoKeys.voidDrawTenants(drawId ?? ""),
    queryFn: () =>
      apiClient
        .get<{
          data: Array<{
            tenantId: string;
            playerCount: number;
            entryCount: number;
            totalOriginalStake: number;
            totalRefundAmount: number;
          }>;
        }>(`/keno/reports/void/draws/${drawId}/tenants`)
        .then((r) => r.data),
    enabled: !!drawId,
  });
}

/** Player breakdown cho 1 draw × 1 tenant void. Drill cấp 3. */
export function useKenoVoidTenantPlayers(drawId: string, tenantId: string | null) {
  return useQuery({
    queryKey: kenoKeys.voidTenantPlayers({ drawId, tenantId: tenantId ?? "" }),
    queryFn: () =>
      apiClient
        .get<{
          data: Array<{
            accountId: string;
            username: string;
            entryCount: number;
            totalOriginalStake: number;
            totalRefundAmount: number;
          }>;
        }>(`/keno/reports/void/draws/${drawId}/${tenantId}/players`)
        .then((r) => r.data),
    enabled: !!(drawId && tenantId),
  });
}

/** Entries void của 1 player trong 1 draw × tenant. Drill cấp 4. */
export function useKenoVoidPlayerEntries(drawId: string, tenantId: string, accountId: string | null) {
  return useQuery({
    queryKey: kenoKeys.voidPlayerEntries({ drawId, tenantId, accountId: accountId ?? "" }),
    queryFn: () =>
      apiClient
        .get<ListEntryBreakdownOutput>(`/keno/reports/void/draws/${drawId}/${tenantId}/${accountId}/entries`)
        .then((r) => r.data),
    enabled: !!(drawId && tenantId && accountId),
  });
}

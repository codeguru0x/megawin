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
} from "@megawin/game-lotto535-application/use-cases/reports";
import { apiClient } from "@megawin/next/client";
import { useQuery } from "@tanstack/react-query";

import { lotto535Keys } from "@/lib/query-keys";

// ─── By-Draw Queries ──────────────────────────────────────────────────────────

/** KPI summary tổng hợp theo date range — dùng cho KPI strip tab "Theo kỳ quay". */
export function useLotto535DrawSummary(from: string, to: string) {
  return useQuery({
    queryKey: lotto535Keys.reportDrawsSummary({ from, to }),
    queryFn: () =>
      apiClient
        .get<GetDrawSummaryOutput>("/lotto535/reports/draws/summary", {
          params: { from, to },
        })
        .then((r) => r.data),
    enabled: !!(from && to),
  });
}

/** Danh sách kỳ quay đã settle — paginated. */
export function useLotto535DrawList(from: string, to: string, page: number) {
  return useQuery({
    queryKey: lotto535Keys.reportDraws({ from, to, page }),
    queryFn: () =>
      apiClient.get<ListSettleDrawReportsOutput>("/lotto535/reports/draws", {
        params: { from, to, page, limit: 20 },
      }),
    enabled: !!(from && to),
  });
}

/** Danh sách tenants cho 1 kỳ quay — drill cấp 2. */
export function useLotto535DrawTenants(drawId: string | null) {
  return useQuery({
    queryKey: lotto535Keys.reportDrawTenants(drawId ?? ""),
    queryFn: () =>
      apiClient.get<ListDrawTenantsOutput>(`/lotto535/reports/draws/${drawId}/tenants`).then((r) => r.data),
    enabled: !!drawId,
  });
}

// ─── By-Tenant Queries ────────────────────────────────────────────────────────

/** Danh sách tenants aggregate theo date range — tab "Theo đại lý". */
export function useLotto535TenantList(from: string, to: string) {
  return useQuery({
    queryKey: lotto535Keys.reportTenants({ from, to }),
    queryFn: () =>
      apiClient
        .get<ListTenantReportsOutput>("/lotto535/reports/tenants", {
          params: { from, to },
        })
        .then((r) => r.data),
    enabled: !!(from && to),
  });
}

/** Danh sách kỳ quay của 1 tenant — drill cấp 2, paginated. */
export function useLotto535TenantDraws(tenantId: string | null, from: string, to: string) {
  return useQuery({
    queryKey: lotto535Keys.reportTenantDraws({ tenantId: tenantId ?? "", from, to }),
    queryFn: () =>
      apiClient.get<ListTenantDrawsOutput>(`/lotto535/reports/tenants/${tenantId}/draws`, {
        params: { from, to },
      }),
    enabled: !!(tenantId && from && to),
  });
}

// ─── Deep Drill Queries ───────────────────────────────────────────────────────

/** Danh sách players cho 1 draw × 1 tenant — drill cấp 3. */
export function useLotto535Players(drawId: string, tenantId: string | null) {
  return useQuery({
    queryKey: lotto535Keys.reportPlayers({ drawId, tenantId: tenantId ?? "" }),
    queryFn: () =>
      apiClient
        .get<ListPlayerBreakdownOutput>("/lotto535/reports/players", {
          params: { drawId, tenantId: tenantId! },
        })
        .then((r) => r.data),
    enabled: !!(drawId && tenantId),
  });
}

/** Danh sách entries của 1 player — drill cấp 4. */
export function useLotto535Entries(drawId: string, tenantId: string, accountId: string) {
  return useQuery({
    queryKey: lotto535Keys.reportEntries({ drawId, tenantId, accountId }),
    queryFn: () =>
      apiClient
        .get<ListEntryBreakdownOutput>("/lotto535/reports/entries", {
          params: { drawId, tenantId, accountId },
        })
        .then((r) => r.data),
    enabled: !!(drawId && tenantId && accountId),
  });
}

// ─── Outstanding & Void ───────────────────────────────────────────────────────

/** Các kỳ quay đang outstanding (chưa settle). Tự refresh mỗi 60 giây. */
export function useLotto535Outstanding() {
  return useQuery({
    queryKey: lotto535Keys.outstandingDraws,
    queryFn: () => apiClient.get<GetOutstandingReportsOutput>("/lotto535/reports/outstanding").then((r) => r.data),
    refetchInterval: 60_000,
  });
}

/** Tenant breakdown cho 1 draw outstanding. Drill cấp 2. Tự refresh mỗi 60 giây. */
export function useLotto535OutstandingDrawTenants(drawId: string | null) {
  return useQuery({
    queryKey: lotto535Keys.outstandingTenants(drawId ?? ""),
    queryFn: () =>
      apiClient
        .get<ListOutstandingDrawTenantsOutput>(`/lotto535/reports/outstanding/draws/${drawId}/tenants`)
        .then((r) => r.data),
    enabled: !!drawId,
    refetchInterval: 60_000,
  });
}

/** Player breakdown cho 1 draw × 1 tenant outstanding. Drill cấp 3. Tự refresh mỗi 60 giây. */
export function useLotto535OutstandingTenantPlayers(drawId: string, tenantId: string | null) {
  return useQuery({
    queryKey: lotto535Keys.outstandingPlayers({ drawId, tenantId: tenantId ?? "" }),
    queryFn: () =>
      apiClient
        .get<ListOutstandingTenantPlayersOutput>(`/lotto535/reports/outstanding/draws/${drawId}/${tenantId}/players`)
        .then((r) => r.data),
    enabled: !!(drawId && tenantId),
    refetchInterval: 60_000,
  });
}

/** Entries outstanding của 1 player trong 1 draw × tenant. Drill cấp 4. Tự refresh mỗi 60 giây. */
export function useLotto535OutstandingPlayerEntries(drawId: string, tenantId: string, accountId: string | null) {
  return useQuery({
    queryKey: lotto535Keys.outstandingEntries({ drawId, tenantId, accountId: accountId ?? "" }),
    queryFn: () =>
      apiClient
        .get<ListOutstandingPlayerEntriesOutput>(
          `/lotto535/reports/outstanding/draws/${drawId}/${tenantId}/${accountId}/entries`,
        )
        .then((r) => r.data),
    enabled: !!(drawId && tenantId && accountId),
    refetchInterval: 60_000,
  });
}

/** Danh sách kỳ quay đã void theo date range. */
export function useLotto535VoidReports(from: string, to: string) {
  return useQuery({
    queryKey: lotto535Keys.voidReports({ from, to }),
    queryFn: () =>
      apiClient
        .get<ListVoidReportsOutput>("/lotto535/reports/void", {
          params: { from, to },
        })
        .then((r) => r.data),
    enabled: !!(from && to),
  });
}

/** Tenant breakdown cho 1 draw void. Drill cấp 2. */
export function useLotto535VoidDrawTenants(drawId: string | null) {
  return useQuery({
    queryKey: lotto535Keys.voidDrawTenants(drawId ?? ""),
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
        }>(`/lotto535/reports/void/draws/${drawId}/tenants`)
        .then((r) => r.data),
    enabled: !!drawId,
  });
}

/** Player breakdown cho 1 draw × 1 tenant void. Drill cấp 3. */
export function useLotto535VoidTenantPlayers(drawId: string, tenantId: string | null) {
  return useQuery({
    queryKey: lotto535Keys.voidTenantPlayers({ drawId, tenantId: tenantId ?? "" }),
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
        }>(`/lotto535/reports/void/draws/${drawId}/${tenantId}/players`)
        .then((r) => r.data),
    enabled: !!(drawId && tenantId),
  });
}

/** Entries void của 1 player trong 1 draw × tenant. Drill cấp 4. */
export function useLotto535VoidPlayerEntries(drawId: string, tenantId: string, accountId: string | null) {
  return useQuery({
    queryKey: lotto535Keys.voidPlayerEntries({ drawId, tenantId, accountId: accountId ?? "" }),
    queryFn: () =>
      apiClient
        .get<ListEntryBreakdownOutput>(`/lotto535/reports/void/draws/${drawId}/${tenantId}/${accountId}/entries`)
        .then((r) => r.data),
    enabled: !!(drawId && tenantId && accountId),
  });
}

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
} from "@megawin/game-max3d-application/use-cases/reports";
import { apiClient } from "@megawin/next/client";
import { useQuery } from "@tanstack/react-query";

import { max3dKeys } from "@/lib/query-keys";

// ─── By-Draw Queries ──────────────────────────────────────────────────────────

/** KPI summary tổng hợp theo date range — dùng cho KPI strip tab "Theo kỳ quay". */
export function useMax3DDrawSummary(from: string, to: string) {
  return useQuery({
    queryKey: max3dKeys.reportDrawsSummary({ from, to }),
    queryFn: () =>
      apiClient
        .get<GetDrawSummaryOutput>("/max3d/reports/draws/summary", {
          params: { from, to },
        })
        .then((r) => r.data),
    enabled: !!(from && to),
  });
}

/** Danh sách kỳ quay đã settle — paginated. */
export function useMax3DDrawList(from: string, to: string, page: number) {
  return useQuery({
    queryKey: max3dKeys.reportDraws({ from, to, page }),
    queryFn: () =>
      apiClient.get<ListSettleDrawReportsOutput>("/max3d/reports/draws", {
        params: { from, to, page, limit: 20 },
      }),
    enabled: !!(from && to),
  });
}

/** Danh sách tenants cho 1 kỳ quay — drill cấp 2. */
export function useMax3DDrawTenants(drawId: string | null) {
  return useQuery({
    queryKey: max3dKeys.reportDrawTenants(drawId ?? ""),
    queryFn: () => apiClient.get<ListDrawTenantsOutput>(`/max3d/reports/draws/${drawId}/tenants`).then((r) => r.data),
    enabled: !!drawId,
  });
}

// ─── By-Tenant Queries ────────────────────────────────────────────────────────

/** Danh sách tenants aggregate theo date range — tab "Theo đại lý". */
export function useMax3DTenantList(from: string, to: string) {
  return useQuery({
    queryKey: max3dKeys.reportTenants({ from, to }),
    queryFn: () =>
      apiClient
        .get<ListTenantReportsOutput>("/max3d/reports/tenants", {
          params: { from, to },
        })
        .then((r) => r.data),
    enabled: !!(from && to),
  });
}

/** Danh sách kỳ quay của 1 tenant — drill cấp 2, paginated. */
export function useMax3DTenantDraws(tenantId: string | null, from: string, to: string) {
  return useQuery({
    queryKey: max3dKeys.reportTenantDraws({ tenantId: tenantId ?? "", from, to }),
    queryFn: () =>
      apiClient.get<ListTenantDrawsOutput>(`/max3d/reports/tenants/${tenantId}/draws`, {
        params: { from, to },
      }),
    enabled: !!(tenantId && from && to),
  });
}

// ─── Deep Drill Queries ───────────────────────────────────────────────────────

/** Danh sách players cho 1 draw × 1 tenant — drill cấp 3. */
export function useMax3DPlayers(drawId: string, tenantId: string | null) {
  return useQuery({
    queryKey: max3dKeys.reportPlayers({ drawId, tenantId: tenantId ?? "" }),
    queryFn: () =>
      apiClient
        .get<ListPlayerBreakdownOutput>("/max3d/reports/players", {
          params: { drawId, tenantId: tenantId! },
        })
        .then((r) => r.data),
    enabled: !!(drawId && tenantId),
  });
}

/** Danh sách entries của 1 player — drill cấp 4. */
export function useMax3DEntries(drawId: string, tenantId: string, accountId: string) {
  return useQuery({
    queryKey: max3dKeys.reportEntries({ drawId, tenantId, accountId }),
    queryFn: () =>
      apiClient
        .get<ListEntryBreakdownOutput>("/max3d/reports/entries", {
          params: { drawId, tenantId, accountId },
        })
        .then((r) => r.data),
    enabled: !!(drawId && tenantId && accountId),
  });
}

// ─── Outstanding & Void ───────────────────────────────────────────────────────

/** Các kỳ quay đang outstanding (chưa settle). Tự refresh mỗi 60 giây. */
export function useMax3DOutstanding() {
  return useQuery({
    queryKey: max3dKeys.outstandingDraws,
    queryFn: () => apiClient.get<GetOutstandingReportsOutput>("/max3d/reports/outstanding").then((r) => r.data),
    refetchInterval: 60_000,
  });
}

/** Tenant breakdown cho 1 draw outstanding — drill cấp 2. */
export function useMax3DOutstandingDrawTenants(drawId: string | null) {
  return useQuery({
    queryKey: max3dKeys.outstandingTenants(drawId ?? ""),
    queryFn: () =>
      apiClient
        .get<ListOutstandingDrawTenantsOutput>(`/max3d/reports/outstanding/draws/${drawId}/tenants`)
        .then((r) => r.data),
    enabled: !!drawId,
  });
}

/** Player breakdown cho 1 draw × 1 tenant outstanding — drill cấp 3. */
export function useMax3DOutstandingTenantPlayers(drawId: string, tenantId: string | null) {
  return useQuery({
    queryKey: max3dKeys.outstandingPlayers({ drawId, tenantId: tenantId ?? "" }),
    queryFn: () =>
      apiClient
        .get<ListOutstandingTenantPlayersOutput>(
          `/max3d/reports/outstanding/draws/${drawId}/tenants/${tenantId}/players`,
        )
        .then((r) => r.data),
    enabled: !!(drawId && tenantId),
  });
}

/** Entry list của 1 player trong 1 draw × tenant outstanding — drill cấp 4. */
export function useMax3DOutstandingPlayerEntries(drawId: string, tenantId: string, accountId: string | null) {
  return useQuery({
    queryKey: max3dKeys.outstandingEntries({ drawId, tenantId, accountId: accountId ?? "" }),
    queryFn: () =>
      apiClient
        .get<ListOutstandingPlayerEntriesOutput>(
          `/max3d/reports/outstanding/draws/${drawId}/tenants/${tenantId}/players/${accountId}/entries`,
        )
        .then((r) => r.data),
    enabled: !!(drawId && tenantId && accountId),
  });
}

/** Danh sách kỳ quay đã void theo date range. */
export function useMax3DVoidReports(from: string, to: string) {
  return useQuery({
    queryKey: max3dKeys.voidReports({ from, to }),
    queryFn: () =>
      apiClient
        .get<ListVoidReportsOutput>("/max3d/reports/void", {
          params: { from, to },
        })
        .then((r) => r.data),
    enabled: !!(from && to),
  });
}

/** Tenant breakdown cho 1 draw void. Drill cấp 2. */
export function useMax3DVoidDrawTenants(drawId: string | null) {
  return useQuery({
    queryKey: max3dKeys.voidDrawTenants(drawId ?? ""),
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
        }>(`/max3d/reports/void/draws/${drawId}/tenants`)
        .then((r) => r.data),
    enabled: !!drawId,
  });
}

/** Player breakdown cho 1 draw × 1 tenant void. Drill cấp 3. */
export function useMax3DVoidTenantPlayers(drawId: string, tenantId: string | null) {
  return useQuery({
    queryKey: max3dKeys.voidTenantPlayers({ drawId, tenantId: tenantId ?? "" }),
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
        }>(`/max3d/reports/void/draws/${drawId}/${tenantId}/players`)
        .then((r) => r.data),
    enabled: !!(drawId && tenantId),
  });
}

/** Entries void của 1 player trong 1 draw × tenant. Drill cấp 4. */
export function useMax3DVoidPlayerEntries(drawId: string, tenantId: string, accountId: string | null) {
  return useQuery({
    queryKey: max3dKeys.voidPlayerEntries({ drawId, tenantId, accountId: accountId ?? "" }),
    queryFn: () =>
      apiClient
        .get<ListEntryBreakdownOutput>(`/max3d/reports/void/draws/${drawId}/${tenantId}/${accountId}/entries`)
        .then((r) => r.data),
    enabled: !!(drawId && tenantId && accountId),
  });
}

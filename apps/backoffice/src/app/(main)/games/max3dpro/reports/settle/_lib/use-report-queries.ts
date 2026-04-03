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
  ListOutstandingDrawTenantsOutput,
  ListOutstandingTenantPlayersOutput,
  ListOutstandingPlayerEntriesOutput,
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
    queryKey: max3dproKeys.outstandingDraws,
    queryFn: () =>
      apiClient
        .get<GetOutstandingReportsOutput>("/max3dpro/reports/outstanding")
        .then((r) => r.data),
    refetchInterval: 60_000,
  });
}

/** Tenant breakdown cho 1 draw outstanding. Drill cấp 2. Tự refresh mỗi 60 giây. */
export function useMax3DProOutstandingDrawTenants(drawId: string | null) {
  return useQuery({
    queryKey: max3dproKeys.outstandingTenants(drawId ?? ""),
    queryFn: () =>
      apiClient
        .get<ListOutstandingDrawTenantsOutput>(
          `/max3dpro/reports/outstanding/draws/${drawId}/tenants`,
        )
        .then((r) => r.data),
    enabled: !!drawId,
    refetchInterval: 60_000,
  });
}

/** Player breakdown cho 1 draw × 1 tenant outstanding. Drill cấp 3. Tự refresh mỗi 60 giây. */
export function useMax3DProOutstandingTenantPlayers(drawId: string, tenantId: string | null) {
  return useQuery({
    queryKey: max3dproKeys.outstandingPlayers({ drawId, tenantId: tenantId ?? "" }),
    queryFn: () =>
      apiClient
        .get<ListOutstandingTenantPlayersOutput>(
          `/max3dpro/reports/outstanding/draws/${drawId}/tenants/${tenantId}/players`,
        )
        .then((r) => r.data),
    enabled: !!(drawId && tenantId),
    refetchInterval: 60_000,
  });
}

/** Entries outstanding của 1 player trong 1 draw × tenant. Drill cấp 4. Tự refresh mỗi 60 giây. */
export function useMax3DProOutstandingPlayerEntries(
  drawId: string,
  tenantId: string,
  accountId: string | null,
) {
  return useQuery({
    queryKey: max3dproKeys.outstandingEntries({ drawId, tenantId, accountId: accountId ?? "" }),
    queryFn: () =>
      apiClient
        .get<ListOutstandingPlayerEntriesOutput>(
          `/max3dpro/reports/outstanding/draws/${drawId}/tenants/${tenantId}/players/${accountId}/entries`,
        )
        .then((r) => r.data),
    enabled: !!(drawId && tenantId && accountId),
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

/** Tenant breakdown cho 1 draw void. Drill cấp 2. */
export function useMax3DProVoidDrawTenants(drawId: string | null) {
  return useQuery({
    queryKey: max3dproKeys.voidDrawTenants(drawId ?? ""),
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
        }>(`/max3dpro/reports/void/draws/${drawId}/tenants`)
        .then((r) => r.data),
    enabled: !!drawId,
  });
}

/** Player breakdown cho 1 draw × 1 tenant void. Drill cấp 3. */
export function useMax3DProVoidTenantPlayers(drawId: string, tenantId: string | null) {
  return useQuery({
    queryKey: max3dproKeys.voidTenantPlayers({ drawId, tenantId: tenantId ?? "" }),
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
        }>(`/max3dpro/reports/void/draws/${drawId}/${tenantId}/players`)
        .then((r) => r.data),
    enabled: !!(drawId && tenantId),
  });
}

/** Entries void của 1 player trong 1 draw × tenant. Drill cấp 4. */
export function useMax3DProVoidPlayerEntries(
  drawId: string,
  tenantId: string,
  accountId: string | null,
) {
  return useQuery({
    queryKey: max3dproKeys.voidPlayerEntries({ drawId, tenantId, accountId: accountId ?? "" }),
    queryFn: () =>
      apiClient
        .get<ListEntryBreakdownOutput>(
          `/max3dpro/reports/void/draws/${drawId}/${tenantId}/${accountId}/entries`,
        )
        .then((r) => r.data),
    enabled: !!(drawId && tenantId && accountId),
  });
}

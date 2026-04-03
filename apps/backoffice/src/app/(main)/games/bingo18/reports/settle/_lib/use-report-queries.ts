"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@megawin/next/client";
import { bingo18Keys } from "@/lib/query-keys";
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
} from "@megawin/game-bingo18-application/use-cases/reports";

// ─── By-Draw Queries ──────────────────────────────────────────────────────────

/** KPI summary tổng hợp theo date range — dùng cho KPI strip tab "Theo kỳ quay". */
export function useBingo18DrawSummary(from: string, to: string) {
  return useQuery({
    queryKey: bingo18Keys.reportDrawsSummary({ from, to }),
    queryFn: () =>
      apiClient
        .get<GetDrawSummaryOutput>("/bingo18/reports/draws/summary", {
          params: { from, to },
        })
        .then((r) => r.data),
    enabled: !!(from && to),
  });
}

/** Danh sách kỳ quay đã settle — paginated. */
export function useBingo18DrawList(from: string, to: string, page: number) {
  return useQuery({
    queryKey: bingo18Keys.reportDraws({ from, to, page }),
    queryFn: () =>
      apiClient.get<ListSettleDrawReportsOutput>("/bingo18/reports/draws", {
        params: { from, to, page, limit: 20 },
      }),
    enabled: !!(from && to),
  });
}

/** Danh sách tenants cho 1 kỳ quay — drill cấp 2. */
export function useBingo18DrawTenants(drawId: string | null) {
  return useQuery({
    queryKey: bingo18Keys.reportDrawTenants(drawId ?? ""),
    queryFn: () =>
      apiClient
        .get<ListDrawTenantsOutput>(`/bingo18/reports/draws/${drawId}/tenants`)
        .then((r) => r.data),
    enabled: !!drawId,
  });
}

// ─── By-Tenant Queries ────────────────────────────────────────────────────────

/** Danh sách tenants aggregate theo date range — tab "Theo đại lý". */
export function useBingo18TenantList(from: string, to: string) {
  return useQuery({
    queryKey: bingo18Keys.reportTenants({ from, to }),
    queryFn: () =>
      apiClient
        .get<ListTenantReportsOutput>("/bingo18/reports/tenants", {
          params: { from, to },
        })
        .then((r) => r.data),
    enabled: !!(from && to),
  });
}

/** Danh sách kỳ quay của 1 tenant — drill cấp 2, paginated. */
export function useBingo18TenantDraws(tenantId: string | null, from: string, to: string) {
  return useQuery({
    queryKey: bingo18Keys.reportTenantDraws({ tenantId: tenantId ?? "", from, to }),
    queryFn: () =>
      apiClient.get<ListTenantDrawsOutput>(`/bingo18/reports/tenants/${tenantId}/draws`, {
        params: { from, to },
      }),
    enabled: !!(tenantId && from && to),
  });
}

// ─── Deep Drill Queries ───────────────────────────────────────────────────────

/** Danh sách players cho 1 draw × 1 tenant — drill cấp 3. */
export function useBingo18Players(drawId: string, tenantId: string | null) {
  return useQuery({
    queryKey: bingo18Keys.reportPlayers({ drawId, tenantId: tenantId ?? "" }),
    queryFn: () =>
      apiClient
        .get<ListPlayerBreakdownOutput>("/bingo18/reports/players", {
          params: { drawId, tenantId: tenantId! },
        })
        .then((r) => r.data),
    enabled: !!(drawId && tenantId),
  });
}

/** Danh sách entries của 1 player — drill cấp 4. */
export function useBingo18Entries(drawId: string, tenantId: string, accountId: string) {
  return useQuery({
    queryKey: bingo18Keys.reportEntries({ drawId, tenantId, accountId }),
    queryFn: () =>
      apiClient
        .get<ListEntryBreakdownOutput>("/bingo18/reports/entries", {
          params: { drawId, tenantId, accountId },
        })
        .then((r) => r.data),
    enabled: !!(drawId && tenantId && accountId),
  });
}

// ─── Outstanding & Void ───────────────────────────────────────────────────────

/** Các kỳ quay đang outstanding (chưa settle). Tự refresh mỗi 60 giây. */
export function useBingo18Outstanding() {
  return useQuery({
    queryKey: bingo18Keys.outstandingDraws,
    queryFn: () =>
      apiClient
        .get<GetOutstandingReportsOutput>("/bingo18/reports/outstanding")
        .then((r) => r.data),
    refetchInterval: 60_000,
  });
}

/** Tenant breakdown của 1 draw outstanding — drill cấp 2. */
export function useBingo18OutstandingDrawTenants(drawId: string | null) {
  return useQuery({
    queryKey: bingo18Keys.outstandingTenants(drawId ?? ""),
    queryFn: () =>
      apiClient
        .get<ListOutstandingDrawTenantsOutput>(
          `/bingo18/reports/outstanding/draws/${drawId}/tenants`,
        )
        .then((r) => r.data),
    enabled: !!drawId,
  });
}

/** Player breakdown của 1 draw × 1 tenant outstanding — drill cấp 3. */
export function useBingo18OutstandingTenantPlayers(drawId: string, tenantId: string | null) {
  return useQuery({
    queryKey: bingo18Keys.outstandingPlayers({ drawId, tenantId: tenantId ?? "" }),
    queryFn: () =>
      apiClient
        .get<ListOutstandingTenantPlayersOutput>(
          `/bingo18/reports/outstanding/draws/${drawId}/tenants/${tenantId}/players`,
        )
        .then((r) => r.data),
    enabled: !!(drawId && tenantId),
  });
}

/** Danh sách entries outstanding của 1 player — drill cấp 4. */
export function useBingo18OutstandingPlayerEntries(
  drawId: string,
  tenantId: string,
  accountId: string | null,
) {
  return useQuery({
    queryKey: bingo18Keys.outstandingEntries({
      drawId,
      tenantId,
      accountId: accountId ?? "",
    }),
    queryFn: () =>
      apiClient
        .get<ListOutstandingPlayerEntriesOutput>(
          `/bingo18/reports/outstanding/draws/${drawId}/tenants/${tenantId}/players/${accountId}/entries`,
        )
        .then((r) => r.data),
    enabled: !!(drawId && tenantId && accountId),
  });
}

/** Danh sách kỳ quay đã void theo date range. */
export function useBingo18VoidReports(from: string, to: string) {
  return useQuery({
    queryKey: bingo18Keys.voidReports({ from, to }),
    queryFn: () =>
      apiClient
        .get<ListVoidReportsOutput>("/bingo18/reports/void", {
          params: { from, to },
        })
        .then((r) => r.data),
    enabled: !!(from && to),
  });
}

/** Tenant breakdown cho 1 draw void. Drill cấp 2. */
export function useBingo18VoidDrawTenants(drawId: string | null) {
  return useQuery({
    queryKey: bingo18Keys.voidDrawTenants(drawId ?? ""),
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
        }>(`/bingo18/reports/void/draws/${drawId}/tenants`)
        .then((r) => r.data),
    enabled: !!drawId,
  });
}

/** Player breakdown cho 1 draw × 1 tenant void. Drill cấp 3. */
export function useBingo18VoidTenantPlayers(drawId: string, tenantId: string | null) {
  return useQuery({
    queryKey: bingo18Keys.voidTenantPlayers({ drawId, tenantId: tenantId ?? "" }),
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
        }>(`/bingo18/reports/void/draws/${drawId}/${tenantId}/players`)
        .then((r) => r.data),
    enabled: !!(drawId && tenantId),
  });
}

/** Entries void của 1 player trong 1 draw × tenant. Drill cấp 4. */
export function useBingo18VoidPlayerEntries(
  drawId: string,
  tenantId: string,
  accountId: string | null,
) {
  return useQuery({
    queryKey: bingo18Keys.voidPlayerEntries({ drawId, tenantId, accountId: accountId ?? "" }),
    queryFn: () =>
      apiClient
        .get<ListEntryBreakdownOutput>(
          `/bingo18/reports/void/draws/${drawId}/${tenantId}/${accountId}/entries`,
        )
        .then((r) => r.data),
    enabled: !!(drawId && tenantId && accountId),
  });
}

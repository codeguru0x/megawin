"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@megawin/next/client";
import { mega645Keys } from "@/lib/query-keys";
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
} from "@megawin/game-mega645-application/use-cases/reports";

// ─── By-Draw Queries ──────────────────────────────────────────────────────────

/** KPI summary tổng hợp theo date range — dùng cho KPI strip tab "Theo kỳ quay". */
export function useMega645DrawSummary(from: string, to: string) {
  return useQuery({
    queryKey: mega645Keys.reportDrawsSummary({ from, to }),
    queryFn: () =>
      apiClient
        .get<GetDrawSummaryOutput>("/mega645/reports/draws/summary", {
          params: { from, to },
        })
        .then((r) => r.data),
    enabled: !!(from && to),
  });
}

/** Danh sách kỳ quay đã settle — paginated. */
export function useMega645DrawList(from: string, to: string, page: number) {
  return useQuery({
    queryKey: mega645Keys.reportDraws({ from, to, page }),
    queryFn: () =>
      apiClient.get<ListSettleDrawReportsOutput>("/mega645/reports/draws", {
        params: { from, to, page, limit: 20 },
      }),
    enabled: !!(from && to),
  });
}

/** Danh sách tenants cho 1 kỳ quay — drill cấp 2. */
export function useMega645DrawTenants(drawId: string | null) {
  return useQuery({
    queryKey: mega645Keys.reportDrawTenants(drawId ?? ""),
    queryFn: () =>
      apiClient
        .get<ListDrawTenantsOutput>(`/mega645/reports/draws/${drawId}/tenants`)
        .then((r) => r.data),
    enabled: !!drawId,
  });
}

// ─── By-Tenant Queries ────────────────────────────────────────────────────────

/** Danh sách tenants aggregate theo date range — tab "Theo đại lý". */
export function useMega645TenantList(from: string, to: string) {
  return useQuery({
    queryKey: mega645Keys.reportTenants({ from, to }),
    queryFn: () =>
      apiClient
        .get<ListTenantReportsOutput>("/mega645/reports/tenants", {
          params: { from, to },
        })
        .then((r) => r.data),
    enabled: !!(from && to),
  });
}

/** Danh sách kỳ quay của 1 tenant — drill cấp 2, paginated. */
export function useMega645TenantDraws(tenantId: string | null, from: string, to: string) {
  return useQuery({
    queryKey: mega645Keys.reportTenantDraws({ tenantId: tenantId ?? "", from, to }),
    queryFn: () =>
      apiClient.get<ListTenantDrawsOutput>(`/mega645/reports/tenants/${tenantId}/draws`, {
        params: { from, to },
      }),
    enabled: !!(tenantId && from && to),
  });
}

// ─── Deep Drill Queries ───────────────────────────────────────────────────────

/** Danh sách players cho 1 draw × 1 tenant — drill cấp 3. */
export function useMega645Players(drawId: string, tenantId: string | null) {
  return useQuery({
    queryKey: mega645Keys.reportPlayers({ drawId, tenantId: tenantId ?? "" }),
    queryFn: () =>
      apiClient
        .get<ListPlayerBreakdownOutput>("/mega645/reports/players", {
          params: { drawId, tenantId: tenantId! },
        })
        .then((r) => r.data),
    enabled: !!(drawId && tenantId),
  });
}

/** Danh sách entries của 1 player — drill cấp 4. */
export function useMega645Entries(drawId: string, tenantId: string, accountId: string) {
  return useQuery({
    queryKey: mega645Keys.reportEntries({ drawId, tenantId, accountId }),
    queryFn: () =>
      apiClient
        .get<ListEntryBreakdownOutput>("/mega645/reports/entries", {
          params: { drawId, tenantId, accountId },
        })
        .then((r) => r.data),
    enabled: !!(drawId && tenantId && accountId),
  });
}

// ─── Outstanding & Void ───────────────────────────────────────────────────────

/** Các kỳ quay đang outstanding (chưa settle). Tự refresh mỗi 60 giây. */
export function useMega645Outstanding() {
  return useQuery({
    queryKey: mega645Keys.outstandingDraws,
    queryFn: () =>
      apiClient
        .get<GetOutstandingReportsOutput>("/mega645/reports/outstanding")
        .then((r) => r.data),
    refetchInterval: 60_000,
  });
}

/** Tenant breakdown của 1 draw outstanding. Drill cấp 2. */
export function useMega645OutstandingDrawTenants(drawId: string | null) {
  return useQuery({
    queryKey: mega645Keys.outstandingTenants(drawId ?? ""),
    queryFn: () =>
      apiClient
        .get<ListOutstandingDrawTenantsOutput>(
          `/mega645/reports/outstanding/draws/${drawId}/tenants`,
        )
        .then((r) => r.data),
    enabled: !!drawId,
  });
}

/** Player breakdown của 1 draw × 1 tenant outstanding. Drill cấp 3. */
export function useMega645OutstandingTenantPlayers(drawId: string, tenantId: string | null) {
  return useQuery({
    queryKey: mega645Keys.outstandingPlayers({ drawId, tenantId: tenantId ?? "" }),
    queryFn: () =>
      apiClient
        .get<ListOutstandingTenantPlayersOutput>(
          `/mega645/reports/outstanding/draws/${drawId}/tenants/${tenantId}/players`,
        )
        .then((r) => r.data),
    enabled: !!(drawId && tenantId),
  });
}

/** Entries outstanding của 1 player. Drill cấp 4. */
export function useMega645OutstandingPlayerEntries(
  drawId: string,
  tenantId: string,
  accountId: string | null,
) {
  return useQuery({
    queryKey: mega645Keys.outstandingEntries({
      drawId,
      tenantId,
      accountId: accountId ?? "",
    }),
    queryFn: () =>
      apiClient
        .get<ListOutstandingPlayerEntriesOutput>(
          `/mega645/reports/outstanding/draws/${drawId}/tenants/${tenantId}/players/${accountId}/entries`,
        )
        .then((r) => r.data),
    enabled: !!(drawId && tenantId && accountId),
  });
}

/** Danh sách kỳ quay đã void theo date range. */
export function useMega645VoidReports(from: string, to: string) {
  return useQuery({
    queryKey: mega645Keys.voidReports({ from, to }),
    queryFn: () =>
      apiClient
        .get<ListVoidReportsOutput>("/mega645/reports/void", {
          params: { from, to },
        })
        .then((r) => r.data),
    enabled: !!(from && to),
  });
}

/** Tenant breakdown cho 1 draw void. Drill cấp 2. */
export function useMega645VoidDrawTenants(drawId: string | null) {
  return useQuery({
    queryKey: mega645Keys.voidDrawTenants(drawId ?? ""),
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
        }>(`/mega645/reports/void/draws/${drawId}/tenants`)
        .then((r) => r.data),
    enabled: !!drawId,
  });
}

/** Player breakdown cho 1 draw × 1 tenant void. Drill cấp 3. */
export function useMega645VoidTenantPlayers(drawId: string, tenantId: string | null) {
  return useQuery({
    queryKey: mega645Keys.voidTenantPlayers({ drawId, tenantId: tenantId ?? "" }),
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
        }>(`/mega645/reports/void/draws/${drawId}/${tenantId}/players`)
        .then((r) => r.data),
    enabled: !!(drawId && tenantId),
  });
}

/** Entries void của 1 player trong 1 draw × tenant. Drill cấp 4. */
export function useMega645VoidPlayerEntries(
  drawId: string,
  tenantId: string,
  accountId: string | null,
) {
  return useQuery({
    queryKey: mega645Keys.voidPlayerEntries({ drawId, tenantId, accountId: accountId ?? "" }),
    queryFn: () =>
      apiClient
        .get<ListEntryBreakdownOutput>(
          `/mega645/reports/void/draws/${drawId}/${tenantId}/${accountId}/entries`,
        )
        .then((r) => r.data),
    enabled: !!(drawId && tenantId && accountId),
  });
}

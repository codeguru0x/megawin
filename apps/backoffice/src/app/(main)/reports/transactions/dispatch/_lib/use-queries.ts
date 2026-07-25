"use client";

import { ApiClientError, apiClient } from "@megawin/next/client";
import type {
  CancelOrderOutput,
  GetBatchProgressOutput,
  GetDispatchFacetsOutput,
  GetDispatchSummaryOutput,
  GetOrderByTxOutput,
  ListDispatchOrdersInput,
  ListDispatchOrdersOutput,
} from "@megawin/tenant-dispatch/use-cases/admin";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { tenantDispatchKeys } from "@/lib/query-keys";

/**
 * Serialize cursor object → `"{iso}|{id}"` để server parse lại.
 */
function serializeCursor(cursor: { createdAt: string; id: string } | null): string | undefined {
  if (!cursor) return undefined;
  return `${cursor.createdAt}|${cursor.id}`;
}

/**
 * Filters cho `useDispatchList` — không gồm `cursor`/`limit` (hook tự quản).
 *
 * Identity fields (tx/batchKey/accountId/username): khi có bất kỳ field nào,
 * server bỏ qua date range + dimension filters (xem ListDispatchOrdersUseCase).
 */
export interface DispatchListFilters {
  // Identity lookup
  tx?: string | null;
  batchKey?: string | null;
  accountId?: string | null;
  username?: string | null;

  // Dimension
  tenantId?: string | null;
  status?: ListDispatchOrdersInput["status"] | null;
  sourceKind?: ListDispatchOrdersInput["sourceKind"] | null;
  retryMode?: ListDispatchOrdersInput["retryMode"] | null;

  // Range
  from?: string;
  to?: string;
}

/**
 * List dispatch orders với cursor-based infinite scroll.
 *
 * - **Identity mode**: 1 trong 4 identity fields được set → server trả exact
 *   match (không cần from/to). UI vẫn render list (kết quả thường 1 record
 *   cho `tx`, N records cho `batchKey`, N×M cho `accountId`/`username`).
 * - **Range mode**: `from` + `to` + dimension filters. Polling 30s khi live.
 */
export function useDispatchList(filters: DispatchListFilters) {
  const isIdentityMode = !!(filters.tx || filters.batchKey || filters.accountId || filters.username);

  const qpBase: Record<string, string> = {};
  if (isIdentityMode) {
    if (filters.tx) qpBase.tx = filters.tx;
    if (filters.batchKey) qpBase.batchKey = filters.batchKey;
    if (filters.accountId) qpBase.accountId = filters.accountId;
    if (filters.username) qpBase.username = filters.username;
  } else {
    if (filters.tenantId) qpBase.tenantId = filters.tenantId;
    if (filters.status) qpBase.status = filters.status;
    if (filters.sourceKind) qpBase.sourceKind = filters.sourceKind;
    if (filters.retryMode) qpBase.retryMode = filters.retryMode;
    if (filters.from) qpBase.from = filters.from;
    if (filters.to) qpBase.to = filters.to;
  }

  // Polling 30s chỉ khi range mode + live filter (pending/stuck).
  const isLive = !isIdentityMode && (filters.status === "pending" || filters.retryMode === "stuck");

  return useInfiniteQuery({
    queryKey: tenantDispatchKeys.list({
      tx: filters.tx ?? undefined,
      batchKey: filters.batchKey ?? undefined,
      accountId: filters.accountId ?? undefined,
      username: filters.username ?? undefined,
      tenantId: filters.tenantId ?? undefined,
      status: filters.status ?? undefined,
      sourceKind: filters.sourceKind ?? undefined,
      retryMode: filters.retryMode ?? undefined,
      from: filters.from,
      to: filters.to,
    }),
    enabled: isIdentityMode || !!(filters.from && filters.to),
    initialPageParam: null as { createdAt: string; id: string } | null,
    queryFn: ({ pageParam }) => {
      const params: Record<string, string> = { ...qpBase };
      const serialized = serializeCursor(pageParam);
      if (serialized) params.cursor = serialized;
      return apiClient.get<ListDispatchOrdersOutput>("/tenant-dispatch/list", { params });
    },
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 15_000,
    refetchInterval: isLive ? 30_000 : false,
  });
}

/**
 * Filters cho KPI strip — KHÔNG bị ảnh hưởng `status`/`retryMode` của list.
 */
export interface DispatchSummaryFilters {
  tenantId?: string | null;
  gameId?: string | null;
  batchKey?: string | null;
  from?: string;
  to?: string;
  stuckMinRetry?: number | null;
}

export function useDispatchSummary(filters: DispatchSummaryFilters) {
  const qp: Record<string, string> = {};
  if (filters.tenantId) qp.tenantId = filters.tenantId;
  if (filters.gameId) qp.gameId = filters.gameId;
  if (filters.batchKey) qp.batchKey = filters.batchKey;
  if (filters.from) qp.from = filters.from;
  if (filters.to) qp.to = filters.to;
  if (filters.stuckMinRetry) qp.stuckMinRetry = String(filters.stuckMinRetry);

  return useQuery({
    queryKey: tenantDispatchKeys.summary({
      tenantId: filters.tenantId ?? undefined,
      gameId: filters.gameId ?? undefined,
      batchKey: filters.batchKey ?? undefined,
      from: filters.from,
      to: filters.to,
      stuckMinRetry: filters.stuckMinRetry ?? undefined,
    }),
    enabled: !!(filters.from && filters.to),
    queryFn: () => apiClient.get<GetDispatchSummaryOutput>("/tenant-dispatch/summary", { params: qp }),
    staleTime: 15_000,
  });
}

/**
 * Detail 1 order — cho drawer hoặc tx mode.
 */
export function useDispatchDetail(tx: string | null) {
  return useQuery({
    queryKey: tx ? tenantDispatchKeys.byTx(tx) : tenantDispatchKeys.all,
    enabled: !!tx,
    queryFn: () => apiClient.get<GetOrderByTxOutput>(`/tenant-dispatch/${encodeURIComponent(tx!)}`),
  });
}

/**
 * Batch progress card — sub-page `/batches/[batchKey]`.
 *
 * Polling 30s vì batch có thể đang được dispatch.
 */
export function useBatchProgress(batchKey: string | null) {
  return useQuery({
    queryKey: batchKey ? tenantDispatchKeys.batchProgress(batchKey) : tenantDispatchKeys.all,
    enabled: !!batchKey,
    queryFn: () =>
      apiClient.get<GetBatchProgressOutput>("/tenant-dispatch/batch-progress", {
        params: { batchKey: batchKey! },
      }),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

/**
 * Distinct tenant + game có orders trong range — feed Combobox filter.
 *
 * Chỉ phụ thuộc range (from/to), staleTime 60s vì list tenants hiếm thay đổi.
 */
export function useDispatchFacets(filters: { from?: string; to?: string }) {
  const qp: Record<string, string> = {};
  if (filters.from) qp.from = filters.from;
  if (filters.to) qp.to = filters.to;

  return useQuery({
    queryKey: tenantDispatchKeys.facets(filters),
    enabled: !!(filters.from && filters.to),
    queryFn: () => apiClient.get<GetDispatchFacetsOutput>("/tenant-dispatch/facets", { params: qp }),
    staleTime: 60_000,
  });
}

/**
 * Mutation — huỷ 1 order.
 *
 * Sau success: invalidate toàn module để refresh list + drawer + KPI.
 * Toast message phân biệt "đã huỷ" vs "dispatched trước đó" (race condition).
 */
export function useCancelOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tx: string) => apiClient.post<CancelOrderOutput>("/tenant-dispatch/cancel-order", { tx }),
    onSuccess: (res, tx) => {
      void qc.invalidateQueries({ queryKey: tenantDispatchKeys.all });
      if (res.cancelled) {
        toast.success(`Đã huỷ order ${tx.slice(0, 8)}…`);
      } else {
        toast.warning("Order đã được dispatch trước đó, không thể huỷ.");
      }
    },
    onError: (err) => {
      const msg = err instanceof ApiClientError ? err.message : "Không thể huỷ order.";
      toast.error(msg);
    },
  });
}

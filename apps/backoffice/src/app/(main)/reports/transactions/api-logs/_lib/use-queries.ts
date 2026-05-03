"use client";

import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { apiClient } from "@megawin/next/client";
import { txLogsKeys } from "@/lib/query-keys";
import type {
  ListTxLogsInput,
  ListTxLogsOutput,
  GetTxLogByTxOutput,
  ListTxLogsByBatchOutput,
  GetTxLogsSummaryOutput,
} from "@megawin/tenant-gateway/use-cases/tx-logs";

/**
 * Serialize cursor object → string `"{iso}|{id}"` để server parse.
 */
function serializeCursor(cursor: { createdAt: string; id: string } | null): string | undefined {
  if (!cursor) return undefined;
  return `${cursor.createdAt}|${cursor.id}`;
}

/**
 * Filters cho `useTxLogList` — không cần `limit/cursor` ở input
 * (query hook tự quản pagination).
 */
export interface TxLogListFilters {
  tx?: string | null;
  from?: string;
  to?: string;
  status?: ListTxLogsInput["status"] | null;
  eventType?: ListTxLogsInput["eventType"] | null;
}

/**
 * List tx logs với cursor-based infinite scroll.
 *
 * - Mode by tx: gửi `tx` only (server ignore các filter khác).
 * - Mode by range: gửi `from/to` + optional `status`, `eventType`.
 */
export function useTxLogList(filters: TxLogListFilters) {
  const qpBase: Record<string, string> = {};
  if (filters.tx) {
    qpBase.tx = filters.tx;
  } else {
    if (filters.from) qpBase.from = filters.from;
    if (filters.to) qpBase.to = filters.to;
    if (filters.status) qpBase.status = filters.status;
    if (filters.eventType) qpBase.eventType = filters.eventType;
  }

  return useInfiniteQuery({
    queryKey: txLogsKeys.list({
      tx: filters.tx ?? undefined,
      from: filters.tx ? undefined : filters.from,
      to: filters.tx ? undefined : filters.to,
      status: filters.tx ? undefined : (filters.status ?? undefined),
      eventType: filters.tx ? undefined : (filters.eventType ?? undefined),
    }),
    enabled: filters.tx ? !!filters.tx : !!(filters.from && filters.to),
    initialPageParam: null as { createdAt: string; id: string } | null,
    queryFn: ({ pageParam }) => {
      const params: Record<string, string> = { ...qpBase };
      const serialized = serializeCursor(pageParam);
      if (serialized) params.cursor = serialized;
      return apiClient.get<ListTxLogsOutput>("/transactions/api-logs", { params });
    },
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 10_000,
  });
}

/**
 * Detail 1 tx log — show trong drawer.
 *
 * `enabled` đảm bảo không fetch khi không có `tx`.
 */
export function useTxLogDetail(tx: string | null) {
  return useQuery({
    queryKey: tx ? txLogsKeys.byTx(tx) : txLogsKeys.all,
    enabled: !!tx,
    queryFn: () =>
      apiClient.get<GetTxLogByTxOutput>(`/transactions/api-logs/${encodeURIComponent(tx!)}`),
  });
}

/**
 * List tất cả items trong 1 batch — dùng ở page `/batches/<batchId>`.
 * Cùng cursor pagination như list tổng.
 */
export function useTxLogsByBatch(batchId: string | null) {
  return useInfiniteQuery({
    queryKey: batchId ? txLogsKeys.byBatch(batchId) : txLogsKeys.all,
    enabled: !!batchId,
    initialPageParam: null as { createdAt: string; id: string } | null,
    queryFn: ({ pageParam }) => {
      const params: Record<string, string> = {};
      const serialized = serializeCursor(pageParam);
      if (serialized) params.cursor = serialized;
      return apiClient.get<ListTxLogsByBatchOutput>(
        `/transactions/api-logs/batches/${encodeURIComponent(batchId!)}`,
        { params },
      );
    },
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 10_000,
  });
}

/**
 * KPI summary cho strip phía trên bảng list.
 *
 * - Chỉ chạy khi có `from` + `to` (KHÔNG chạy khi user search theo tx — strip
 *   sẽ ẩn ở UI layer).
 * - Không chịu ảnh hưởng bởi `status` / `eventType` filter ở bảng: KPI luôn
 *   phản ánh toàn bộ range để staff thấy tổng quan. Filter chỉ áp dụng cho
 *   list bên dưới.
 */
export function useTxLogSummary(params: { from?: string; to?: string; enabled: boolean }) {
  return useQuery({
    queryKey:
      params.from && params.to
        ? txLogsKeys.summary({ from: params.from, to: params.to })
        : txLogsKeys.all,
    enabled: params.enabled && !!params.from && !!params.to,
    queryFn: () =>
      apiClient.get<GetTxLogsSummaryOutput>("/transactions/api-logs/summary", {
        params: { from: params.from!, to: params.to! },
      }),
    staleTime: 10_000,
  });
}

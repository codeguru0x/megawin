"use client";

import { apiClient, ApiClientError } from "@megawin/next/client";
import type { WorkerHealthRow } from "@megawin/worker-core/use-cases/admin/types";
import { noop, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { workersKeys } from "@/lib/query-keys";

/**
 * List sức khoẻ mọi worker cho trang `/system/workers`.
 *
 * Không polling (§3 plan p1-01) — trang tra cứu khi có sự cố, không phải
 * dashboard trực. Nút "Làm mới" gọi `refetch()`.
 */
export const WORKERS_HEALTH_STALE_MS = 10_000;

/** Named export — dùng chung `useWorkersHealth` và `prefetchWorkersHealth` (p1-02). */
export async function fetchWorkersHealth(): Promise<WorkerHealthRow[]> {
  return apiClient.get<WorkerHealthRow[]>("/system/workers");
}

/** Prefetch workers health — stale 10s khớp hook. */
export function prefetchWorkersHealth(qc: QueryClient): void {
  void qc
    .query({
      queryKey: workersKeys.list(),
      queryFn: fetchWorkersHealth,
      staleTime: WORKERS_HEALTH_STALE_MS,
    })
    .catch(noop);
}

export function useWorkersHealth() {
  return useQuery({
    queryKey: workersKeys.list(),
    queryFn: fetchWorkersHealth,
    // 10s — màn theo dõi worker health, không cần nhanh hơn nhịp người đọc (p1-03).
    staleTime: WORKERS_HEALTH_STALE_MS,
  });
}

export interface SetWorkerEnabledInput {
  lockKey: string;
  isEnabled: boolean;
}

export interface SetWorkerEnabledOutput {
  lockKey: string;
  isEnabled: boolean;
}

/**
 * Mutation — bật/tắt kill-switch 1 worker.
 *
 * KHÔNG optimistic update (`onMutate`) — trạng thái worker là dữ liệu
 * server-authoritative, 0 tiền lệ optimistic trong repo (§2.5g mục 6).
 * Toast + invalidate nằm trong hook, không ở component.
 */
export function useSetWorkerEnabled() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SetWorkerEnabledInput) =>
      apiClient.patch<SetWorkerEnabledOutput>("/system/workers/enabled", input),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: workersKeys.all });
      toast.success(`Đã ${res.isEnabled ? "bật" : "tắt"} worker "${res.lockKey}".`);
    },
    onError: (err) => {
      const msg = err instanceof ApiClientError ? err.message : "Không thể đổi trạng thái worker.";
      toast.error(msg);
    },
  });
}

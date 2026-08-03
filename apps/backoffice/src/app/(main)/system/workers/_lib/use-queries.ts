"use client";

import { ApiClientError, apiClient } from "@megawin/next/client";
import type { WorkerHealthRow } from "@megawin/worker-core/use-cases/admin/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { workersKeys } from "@/lib/query-keys";

/**
 * List sức khoẻ mọi worker cho trang `/system/workers`.
 *
 * Không polling (§3 plan p1-01) — trang tra cứu khi có sự cố, không phải
 * dashboard trực. Nút "Làm mới" gọi `refetch()`.
 */
export function useWorkersHealth() {
  return useQuery({
    queryKey: workersKeys.list(),
    queryFn: () => apiClient.get<WorkerHealthRow[]>("/system/workers"),
    staleTime: 10_000,
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

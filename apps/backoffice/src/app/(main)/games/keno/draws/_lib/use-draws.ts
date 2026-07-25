"use client";

import type { DrawStatus } from "@megawin/game-core/entities";
import type {
  CreateDrawOutput,
  CurrentDrawInfo,
  DrawSummary,
  GetCurrentDrawOutput,
  ListDrawsOutput,
  PreviewDrawsOutput,
} from "@megawin/game-keno-application/use-cases/draws";
import { ApiClientError, apiClient } from "@megawin/next/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { kenoKeys } from "@/lib/query-keys";

export type { CurrentDrawInfo, DrawSummary };

export interface ListDrawsParams {
  status?: DrawStatus;
  fromDate?: string;
  toDate?: string;
  page?: number;
  size?: number;
}

// ─────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────

export function useKenoCurrentDraw() {
  return useQuery({
    queryKey: kenoKeys.currentDraw,
    queryFn: () => apiClient.get<GetCurrentDrawOutput>("/keno/draws/current"),
    refetchInterval: 15_000,
  });
}

export function useKenoDrawsList(params: ListDrawsParams) {
  return useQuery({
    queryKey: kenoKeys.draws(params as unknown as Record<string, unknown>),
    queryFn: () =>
      apiClient.get<ListDrawsOutput>("/keno/draws", {
        params: {
          status: params.status,
          fromDate: params.fromDate,
          toDate: params.toDate,
          page: params.page,
          size: params.size,
        },
      }),
  });
}

export function useKenoPreviewDraws(drawDate: string, count: number) {
  return useQuery({
    queryKey: [...kenoKeys.all, "preview", drawDate, count] as const,
    queryFn: () =>
      apiClient.get<PreviewDrawsOutput>("/keno/draws/preview", {
        params: { drawDate, count },
      }),
    enabled: !!drawDate && count > 0,
  });
}

// ─────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────

function useKenoDrawAction<TBody = void>(
  actionPath: (drawId: string) => string,
  method: "post" | "patch",
  successMessage: string,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ drawId, body }: { drawId: string; body?: TBody }) =>
      method === "post" ? apiClient.post(actionPath(drawId), body) : apiClient.patch(actionPath(drawId), body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: kenoKeys.all });
      toast.success(successMessage);
    },
    onError: (err) => {
      toast.error(err instanceof ApiClientError ? err.message : "Thao tác thất bại.");
    },
  });
}

export function useKenoOpenSales() {
  return useKenoDrawAction((id) => `/keno/draws/${id}/open-sales`, "post", "Đã mở bán vé.");
}

export function useKenoCloseSales() {
  return useKenoDrawAction((id) => `/keno/draws/${id}/close-sales`, "post", "Đã đóng bán vé.");
}

export function useKenoPublishResult() {
  return useKenoDrawAction<{
    winningNumbers: string[];
    vietlottRef?: { drawPeriod: string; drawDate: string };
  }>((id) => `/keno/draws/${id}/publish-result`, "post", "Đã công bố kết quả.");
}

export function useKenoTriggerSettle() {
  return useKenoDrawAction((id) => `/keno/draws/${id}/trigger-settle`, "post", "Đã bắt đầu kết sổ.");
}

export function useKenoVoidDraw() {
  return useKenoDrawAction<{ reason: string }>((id) => `/keno/draws/${id}/void`, "post", "Đã huỷ kỳ quay.");
}

export function useKenoUpdateSchedule() {
  return useKenoDrawAction<{ salesOpenAt: string; salesCloseAt: string; drawTime?: string }>(
    (id) => `/keno/draws/${id}/schedule`,
    "patch",
    "Đã cập nhật lịch.",
  );
}

export function useKenoCreateDraw() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { drawDate: string; count: number }) => apiClient.post<CreateDrawOutput>("/keno/draws", data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: kenoKeys.all });
      toast.success(`Đã tạo ${res.draws.length} kỳ quay mới.`);
    },
    onError: (err) => {
      toast.error(err instanceof ApiClientError ? err.message : "Tạo kỳ quay thất bại.");
    },
  });
}

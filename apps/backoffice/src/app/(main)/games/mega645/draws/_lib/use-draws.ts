"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, ApiClientError } from "@megawin/next/client";
import { toast } from "sonner";
import type { DrawStatus } from "@megawin/game-core/entities";
import type {
  CurrentDrawInfo,
  GetCurrentDrawOutput,
  DrawSummary,
  ListDrawsOutput,
  CreateDrawsOutput,
  PreviewDrawsOutput,
} from "@megawin/game-mega645-application/use-cases/draws";
import { mega645Keys } from "@/lib/query-keys";

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

export function useCurrentDraw() {
  return useQuery({
    queryKey: mega645Keys.currentDraw,
    queryFn: () =>
      apiClient.get<GetCurrentDrawOutput>("/mega645/draws/current"),
    refetchInterval: 15_000,
  });
}

export function useDrawsList(params: ListDrawsParams) {
  return useQuery({
    queryKey: mega645Keys.draws(params as unknown as Record<string, unknown>),
    queryFn: () =>
      apiClient.get<ListDrawsOutput>("/mega645/draws", {
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

export function usePreviewDraws(count: number) {
  return useQuery({
    queryKey: [...mega645Keys.all, "preview", count] as const,
    queryFn: () =>
      apiClient.get<PreviewDrawsOutput>("/mega645/draws/preview", {
        params: { count },
      }),
    enabled: count > 0,
  });
}

// ─────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────

function useDrawAction<TBody = void>(
  actionPath: (drawId: string) => string,
  method: "post" | "patch",
  successMessage: string
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ drawId, body }: { drawId: string; body?: TBody }) =>
      method === "post"
        ? apiClient.post(actionPath(drawId), body)
        : apiClient.patch(actionPath(drawId), body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: mega645Keys.all });
      toast.success(successMessage);
    },
    onError: (err) => {
      toast.error(
        err instanceof ApiClientError ? err.message : "Thao tác thất bại."
      );
    },
  });
}

export function useOpenSales() {
  return useDrawAction(
    (id) => `/mega645/draws/${id}/open-sales`,
    "post",
    "Đã mở bán vé."
  );
}

export function useCloseSales() {
  return useDrawAction(
    (id) => `/mega645/draws/${id}/close-sales`,
    "post",
    "Đã đóng bán vé."
  );
}

export function usePublishResult() {
  return useDrawAction<{
    winningMain: number[];
    vietlottRef?: { drawPeriod: string; drawDate: string };
  }>(
    (id) => `/mega645/draws/${id}/publish-result`,
    "post",
    "Đã công bố kết quả."
  );
}

export function useTriggerSettle() {
  return useDrawAction(
    (id) => `/mega645/draws/${id}/trigger-settle`,
    "post",
    "Đã bắt đầu kết sổ."
  );
}

export function useVoidDraw() {
  return useDrawAction<{ reason: string }>(
    (id) => `/mega645/draws/${id}/void`,
    "post",
    "Đã huỷ kỳ quay."
  );
}

export function useUpdateSchedule() {
  return useDrawAction<{ salesOpenAt: string; salesCloseAt: string; drawTime?: string }>(
    (id) => `/mega645/draws/${id}/schedule`,
    "patch",
    "Đã cập nhật lịch."
  );
}

export function useCreateDraw() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { count: number }) =>
      apiClient.post<CreateDrawsOutput>("/mega645/draws", data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: mega645Keys.all });
      toast.success(`Đã tạo ${res.draws.length} kỳ quay mới.`);
    },
    onError: (err) => {
      toast.error(
        err instanceof ApiClientError ? err.message : "Tạo kỳ quay thất bại."
      );
    },
  });
}

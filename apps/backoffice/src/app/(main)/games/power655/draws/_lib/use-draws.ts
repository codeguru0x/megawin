"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, ApiClientError } from "@megawin/next/client";
import { toast } from "sonner";
import type { DrawStatus } from "@megawin/game-core/entities";
import { power655Keys } from "@/lib/query-keys";
import type {
  CreateDrawsOutput,
  PreviewDrawsOutput,
} from "@megawin/game-power655-application/use-cases/draws";

export interface CurrentDrawInfo {
  drawId: string;
  drawDate: string;
  drawNo: number;
  drawTime: string;
  status: string;
  sales: { openAt: string | null; closeAt: string };
  stats?: { ticketEntryCount: number; totalSalesAmount: number };
  splitCycleIntent?: boolean;
  jp1Amount?: number;
  jp2Amount?: number;
}

export interface DrawSummary {
  drawId: string;
  drawDate: string;
  drawNo: number;
  drawTime: string;
  status: string;
  hasResult: boolean;
  jp1Amount?: number;
  jp2Amount?: number;
  ticketEntryCount?: number;
  totalRevenue?: number;
  isSplitCycle?: boolean;
}

interface GetCurrentDrawOutput {
  activeDraws: CurrentDrawInfo[];
}

interface ListDrawsOutput {
  draws: DrawSummary[];
}

export interface ListDrawsParams {
  status?: DrawStatus;
  fromDate?: string;
  toDate?: string;
  page?: number;
  size?: number;
}

export function useCurrentDraw() {
  return useQuery({
    queryKey: power655Keys.currentDraw,
    queryFn: () =>
      apiClient.get<GetCurrentDrawOutput>("/power655/draws/current"),
    refetchInterval: 15_000,
  });
}

export function useDrawsList(params: ListDrawsParams) {
  return useQuery({
    queryKey: power655Keys.draws(params as unknown as Record<string, unknown>),
    queryFn: () =>
      apiClient.get<ListDrawsOutput>("/power655/draws", {
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
    queryKey: [...power655Keys.all, "preview", count] as const,
    queryFn: () =>
      apiClient.get<PreviewDrawsOutput>("/power655/draws/preview", {
        params: { count },
      }),
    enabled: count > 0,
  });
}

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
      qc.invalidateQueries({ queryKey: power655Keys.all });
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
    (id) => `/power655/draws/${id}/open-sales`,
    "post",
    "Đã mở bán vé."
  );
}

export function useCloseSales() {
  return useDrawAction(
    (id) => `/power655/draws/${id}/close-sales`,
    "post",
    "Đã đóng bán vé."
  );
}

export function usePublishResult() {
  return useDrawAction<{
    winningMain: string[];
    winningBonus: string;
    vietlottRef?: { drawPeriod: string; drawDate: string };
  }>(
    (id) => `/power655/draws/${id}/publish-result`,
    "post",
    "Đã công bố kết quả."
  );
}

export function useTriggerSettle() {
  return useDrawAction(
    (id) => `/power655/draws/${id}/trigger-settle`,
    "post",
    "Đã bắt đầu kết sổ."
  );
}

export function useVoidDraw() {
  return useDrawAction<{ reason: string }>(
    (id) => `/power655/draws/${id}/void`,
    "post",
    "Đã huỷ kỳ quay."
  );
}

export function useUpdateSchedule() {
  return useDrawAction<{ salesOpenAt: string; salesCloseAt: string; drawTime?: string }>(
    (id) => `/power655/draws/${id}/schedule`,
    "patch",
    "Đã cập nhật lịch."
  );
}

export function useCreateDraw() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { count: number }) =>
      apiClient.post<CreateDrawsOutput>("/power655/draws", data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: power655Keys.all });
      toast.success(`Đã tạo ${res.draws.length} kỳ quay mới.`);
    },
    onError: (err) => {
      toast.error(
        err instanceof ApiClientError ? err.message : "Tạo kỳ quay thất bại."
      );
    },
  });
}

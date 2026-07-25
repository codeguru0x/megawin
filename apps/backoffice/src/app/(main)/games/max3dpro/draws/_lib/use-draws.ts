"use client";

import type { DrawStatus } from "@megawin/game-core/entities";
import { ApiClientError, apiClient } from "@megawin/next/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { max3dproKeys } from "@/lib/query-keys";

export interface CurrentDrawInfo {
  drawId: string;
  drawDate: string;
  drawNo: number;
  drawTime: string;
  status: string;
  sales: {
    openAt: string | null;
    closeAt: string;
  };
  stats?: {
    ticketEntryCount: number;
    totalSalesAmount: number;
  };
}

export interface DrawSummary {
  id: string;
  drawId: string;
  drawDate: string;
  financialDate?: string;
  drawNo: number;
  drawTime: string;
  closeAt?: string;
  openAt?: string;
  status: string;
  hasResult: boolean;
  result?: {
    special: string[];
    first: string[];
    second: string[];
    third: string[];
  };
  ticketEntryCount?: number;
  totalRevenue?: number;
  totalPayout?: number;
  financial?: {
    totalFixedPrizes: number;
    totalAgentCommission: number;
    companyTake: number;
  };
}

interface GetCurrentDrawOutput {
  activeDraws: CurrentDrawInfo[];
}

interface ListDrawsOutput {
  draws: DrawSummary[];
  page: number;
  size: number;
}

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
    queryKey: max3dproKeys.currentDraw,
    queryFn: () => apiClient.get<GetCurrentDrawOutput>("/max3dpro/draws/current"),
    refetchInterval: 15_000,
  });
}

export function useDrawsList(params: ListDrawsParams) {
  return useQuery({
    queryKey: max3dproKeys.draws(params as unknown as Record<string, unknown>),
    queryFn: () =>
      apiClient.get<ListDrawsOutput>("/max3dpro/draws", {
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

// ─────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────

function useDrawAction<TBody = void>(
  actionPath: (drawId: string) => string,
  method: "post" | "patch",
  successMessage: string,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ drawId, body }: { drawId: string; body?: TBody }) =>
      method === "post" ? apiClient.post(actionPath(drawId), body) : apiClient.patch(actionPath(drawId), body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: max3dproKeys.all });
      toast.success(successMessage);
    },
    onError: (err) => {
      toast.error(err instanceof ApiClientError ? err.message : "Thao tác thất bại.");
    },
  });
}

export function useOpenSales() {
  return useDrawAction((id) => `/max3dpro/draws/${id}/open-sales`, "post", "Đã mở bán vé.");
}

export function useCloseSales() {
  return useDrawAction((id) => `/max3dpro/draws/${id}/close-sales`, "post", "Đã đóng bán vé.");
}

export function usePublishResult() {
  return useDrawAction<{
    result: {
      special: [string, string];
      first: [string, string, string, string];
      second: [string, string, string, string, string, string];
      third: [string, string, string, string, string, string, string, string];
    };
  }>((id) => `/max3dpro/draws/${id}/publish-result`, "post", "Đã công bố kết quả.");
}

export function useTriggerSettle() {
  return useDrawAction((id) => `/max3dpro/draws/${id}/trigger-settle`, "post", "Đã bắt đầu kết sổ.");
}

export function useVoidDraw() {
  return useDrawAction<{ reason: string }>((id) => `/max3dpro/draws/${id}/void`, "post", "Đã huỷ kỳ quay.");
}

export function useUpdateSchedule() {
  return useDrawAction<{ salesOpenAt: string; salesCloseAt: string; drawTime?: string }>(
    (id) => `/max3dpro/draws/${id}/schedule`,
    "patch",
    "Đã cập nhật lịch.",
  );
}

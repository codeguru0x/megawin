"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, ApiClientError } from "@megawin/next/client";
import { toast } from "sonner";
import type { DrawStatus } from "@megawin/game-core/entities";
import { bingo18Keys } from "@/lib/query-keys";

export interface Bingo18CurrentDrawInfo {
  drawId: string;
  drawNo: number;
  drawDate: string;
  drawTime: string;
  status: string;
  sales: {
    openAt: string | null;
    closeAt: string;
  };
  result?: {
    diceNumbers: number[];
    sum: number;
  };
  stats?: {
    ticketEntryCount: number;
    totalSalesAmount: number;
  };
}

export interface Bingo18DrawSummary {
  drawId: string;
  drawNo: number;
  drawDate: string;
  drawTime: string;
  status: string;
  hasResult: boolean;
  ticketEntryCount?: number;
  totalRevenue?: number;
  result?: {
    diceNumbers: number[];
    sum: number;
  };
}

interface GetCurrentDrawOutput {
  activeDraws: Bingo18CurrentDrawInfo[];
}

interface ListDrawsOutput {
  draws: Bingo18DrawSummary[];
}

interface CreateDrawOutput {
  draws: Array<{ drawNo: number; drawTime: string; status: string }>;
}

interface PreviewDrawsOutput {
  draws: Array<{
    drawNo: number;
    drawTime: string;
    closeAt: string;
    status: string;
  }>;
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

export function useBingo18CurrentDraw() {
  return useQuery({
    queryKey: bingo18Keys.currentDraw,
    queryFn: () => apiClient.get<GetCurrentDrawOutput>("/bingo18/draws/current"),
    refetchInterval: 15_000,
  });
}

export function useBingo18DrawsList(params: ListDrawsParams) {
  return useQuery({
    queryKey: bingo18Keys.draws(params as unknown as Record<string, unknown>),
    queryFn: () =>
      apiClient.get<ListDrawsOutput>("/bingo18/draws", {
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

export function useBingo18PreviewDraws(drawDate: string, count: number) {
  return useQuery({
    queryKey: [...bingo18Keys.all, "preview", drawDate, count] as const,
    queryFn: () =>
      apiClient.get<PreviewDrawsOutput>("/bingo18/draws/preview", {
        params: { drawDate, count },
      }),
    enabled: !!drawDate && count > 0,
  });
}

// ─────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────

function useBingo18DrawAction<TBody = void>(
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
      qc.invalidateQueries({ queryKey: bingo18Keys.all });
      toast.success(successMessage);
    },
    onError: (err) => {
      toast.error(
        err instanceof ApiClientError ? err.message : "Thao tác thất bại."
      );
    },
  });
}

export function useBingo18OpenSales() {
  return useBingo18DrawAction(
    (id) => `/bingo18/draws/${id}/open-sales`,
    "post",
    "Đã mở bán vé."
  );
}

export function useBingo18CloseSales() {
  return useBingo18DrawAction(
    (id) => `/bingo18/draws/${id}/close-sales`,
    "post",
    "Đã đóng bán vé."
  );
}

export function useBingo18PublishResult() {
  return useBingo18DrawAction<{
    diceNumbers: number[];
    vietlottRef?: { drawPeriod: string; drawDate: string };
  }>((id) => `/bingo18/draws/${id}/publish-result`, "post", "Đã công bố kết quả.");
}

export function useBingo18TriggerSettle() {
  return useBingo18DrawAction(
    (id) => `/bingo18/draws/${id}/trigger-settle`,
    "post",
    "Đã bắt đầu kết sổ."
  );
}

export function useBingo18VoidDraw() {
  return useBingo18DrawAction<{ reason: string }>(
    (id) => `/bingo18/draws/${id}/void`,
    "post",
    "Đã huỷ kỳ quay."
  );
}

export function useBingo18UpdateSchedule() {
  return useBingo18DrawAction<{ salesOpenAt: string; salesCloseAt: string; drawTime?: string }>(
    (id) => `/bingo18/draws/${id}/schedule`,
    "patch",
    "Đã cập nhật lịch."
  );
}

export function useBingo18CreateDraw() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { drawDate: string; count: number }) =>
      apiClient.post<CreateDrawOutput>("/bingo18/draws", data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: bingo18Keys.all });
      toast.success(`Đã tạo ${res.draws.length} kỳ quay mới.`);
    },
    onError: (err) => {
      toast.error(
        err instanceof ApiClientError ? err.message : "Tạo kỳ quay thất bại."
      );
    },
  });
}

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, formatErrorToast } from "@megawin/next/client";
import { toast } from "sonner";
import { kenoKeys } from "@/lib/query-keys";
import type {
  OpsSummaryOutput,
  TenantBreakdownOutput,
  NumberFrequencyOutput,
  PlayTypeDistributionOutput,
  GetLiveEntriesOutput,
  GetDrawSelectorOutput,
  GetTopCombosOutput,
  GetWinningEntriesOutput,
} from "@megawin/game-keno-application/use-cases/operations";
import type { GetDrawDetailOutput } from "@megawin/game-keno-application/use-cases/draws";
import type { PreviewDrawsOutput } from "@megawin/game-keno-application/use-cases/draws";

export type {
  OpsSummaryOutput,
  TenantBreakdownOutput,
  TenantBreakdownItem,
  NumberFrequencyOutput,
  NumberFrequencyItem,
  PlayTypeDistributionOutput,
  PlayTypeDistributionItem,
  GetLiveEntriesOutput,
  LiveEntryItem,
  LiveEntryBoard,
  GetDrawSelectorOutput,
  DrawSelectorItem,
  GetTopCombosOutput,
  TopComboItem,
  GetWinningEntriesOutput,
  WinningEntryItem,
  WinningEntryBoardDetail,
  WinningEntriesSummary,
} from "@megawin/game-keno-application/use-cases/operations";

export type { GetDrawDetailOutput } from "@megawin/game-keno-application/use-cases/draws";

export interface OpsQueryParams {
  financialDate?: string;
  drawId?: string;
}

const BASE = "/keno/operations";

// ─────────────────────────────────────────────
// Draw Selector — danh sách kỳ quay cho dropdown
// ─────────────────────────────────────────────

/**
 * Danh sách kỳ quay cho dropdown chọn kỳ.
 * Keno: ~120 kỳ/ngày — group active/upcoming/recent.
 * Refetch mỗi 15s (tần suất cao hơn do kỳ ngắn ~8 phút).
 */
export function useDrawSelectorList() {
  return useQuery({
    queryKey: kenoKeys.opsDrawSelector,
    queryFn: () => apiClient.get<GetDrawSelectorOutput>(`${BASE}/draw-selector`),
    refetchInterval: 15_000,
  });
}

// ─────────────────────────────────────────────
// Draw Detail — chi tiết đầy đủ 1 kỳ quay
// ─────────────────────────────────────────────

/**
 * Chi tiết đầy đủ 1 kỳ: result, financial, stats, settleSummary.
 * Keno không có jackpot snapshot.
 */
export function useDrawDetail(drawId: string | undefined) {
  return useQuery({
    queryKey: kenoKeys.drawDetail(drawId ?? ""),
    queryFn: () => apiClient.get<GetDrawDetailOutput>(`/keno/draws/${drawId}`),
    enabled: !!drawId,
    staleTime: 5 * 60_000,
  });
}

// ─────────────────────────────────────────────
// Operations Analytics
// ─────────────────────────────────────────────

/**
 * KPI tổng quan cược: doanh thu, entries, boards, side bets, players.
 * Keno: refetch mỗi 15s (kỳ ngắn ~8 phút); dừng khi đã settle.
 */
export function useOpsSummary(params: OpsQueryParams, isSettled = false) {
  return useQuery({
    queryKey: kenoKeys.opsSummary(params as unknown as Record<string, unknown>),
    queryFn: () =>
      apiClient.get<OpsSummaryOutput>(`${BASE}/summary`, {
        params: params as unknown as Record<string, string>,
      }),
    refetchInterval: isSettled ? false : 15_000,
    staleTime: isSettled ? Infinity : 10_000,
    enabled: !!params.drawId,
  });
}

/**
 * Phân tích doanh thu theo đại lý (tenant).
 * Refetch mỗi 30s khi đang active.
 */
export function useOpsTenantBreakdown(params: OpsQueryParams, isSettled = false) {
  return useQuery({
    queryKey: kenoKeys.opsTenantBreakdown(params as unknown as Record<string, unknown>),
    queryFn: () =>
      apiClient.get<TenantBreakdownOutput>(`${BASE}/tenants`, {
        params: params as unknown as Record<string, string>,
      }),
    refetchInterval: isSettled ? false : 30_000,
    staleTime: isSettled ? Infinity : 25_000,
    enabled: !!params.drawId,
  });
}

/**
 * Tần suất 80 số Keno (heatmap 8×10).
 * Refetch mỗi 60s khi đang active.
 */
export function useOpsNumberFrequency(params: OpsQueryParams, isSettled = false) {
  return useQuery({
    queryKey: kenoKeys.opsNumberFrequency(params as unknown as Record<string, unknown>),
    queryFn: () =>
      apiClient.get<NumberFrequencyOutput>(`${BASE}/number-frequency`, {
        params: params as unknown as Record<string, string>,
      }),
    refetchInterval: isSettled ? false : 60_000,
    staleTime: isSettled ? Infinity : 55_000,
    enabled: !!params.drawId,
  });
}

/**
 * Phân bổ theo kiểu chơi.
 * Keno: 12 kiểu — pick1-10 (basic) + bigSmall + evenOdd (side bets).
 */
export function useOpsPlayTypeDistribution(params: OpsQueryParams, isSettled = false) {
  return useQuery({
    queryKey: kenoKeys.opsPlayTypeDistribution(params as unknown as Record<string, unknown>),
    queryFn: () =>
      apiClient.get<PlayTypeDistributionOutput>(`${BASE}/playtype-distribution`, {
        params: params as unknown as Record<string, string>,
      }),
    refetchInterval: isSettled ? false : 60_000,
    staleTime: isSettled ? Infinity : 55_000,
    enabled: !!params.drawId,
  });
}

/**
 * Live feed: N entries mới nhất của một kỳ quay Keno.
 * Keno: refetch mỗi 15s khi kỳ đang bán (chu kỳ ngắn).
 */
export function useOpsLiveEntries(drawId: string | undefined, isSettled: boolean) {
  return useQuery({
    queryKey: kenoKeys.opsLiveEntries(drawId ?? ""),
    queryFn: () =>
      apiClient.get<GetLiveEntriesOutput>(`${BASE}/live-entries`, {
        params: { drawId: drawId! },
      }),
    enabled: !!drawId,
    refetchInterval: isSettled ? false : 15_000,
    staleTime: isSettled ? Infinity : 10_000,
  });
}

/**
 * Top N bộ số phổ biến nhất trong một kỳ quay.
 */
export function useOpsTopCombos(drawId: string | undefined, isSettled: boolean) {
  return useQuery({
    queryKey: kenoKeys.opsTopCombos(drawId ?? ""),
    queryFn: () =>
      apiClient.get<GetTopCombosOutput>(`${BASE}/top-combos`, {
        params: { drawId: drawId! },
      }),
    enabled: !!drawId,
    refetchInterval: isSettled ? false : 60_000,
    staleTime: isSettled ? Infinity : 55_000,
  });
}

/**
 * Danh sách entries trúng thưởng + summary. Chỉ fetch khi dialog mở.
 */
export function useWinningEntries(drawId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: kenoKeys.opsWinningEntries(drawId ?? "", "all"),
    queryFn: () =>
      apiClient.get<GetWinningEntriesOutput>(`${BASE}/winning-entries`, {
        params: { drawId: drawId!, limit: 200 },
      }),
    enabled: !!drawId && enabled,
    staleTime: Infinity,
  });
}

// ─────────────────────────────────────────────
// Mutations (draw management)
// ─────────────────────────────────────────────

/** Helper dùng chung cho các draw action mutations. */
function useDrawAction<TBody = void>(
  actionPath: (drawId: string) => string,
  method: "post" | "patch",
  successMessage: string,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ drawId, body }: { drawId: string; body?: TBody }) =>
      method === "post"
        ? apiClient.post(actionPath(drawId), body)
        : apiClient.patch(actionPath(drawId), body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: kenoKeys.all });
      toast.success(successMessage);
    },
    onError: (err) => {
      const { title, description } = formatErrorToast(err, "Thao tác thất bại.");
      toast.error(title, { description });
    },
  });
}

export function useOpenSales() {
  return useDrawAction((id) => `/keno/draws/${id}/open-sales`, "post", "Đã mở bán vé.");
}

export function useCloseSales() {
  return useDrawAction((id) => `/keno/draws/${id}/close-sales`, "post", "Đã đóng bán vé.");
}

export function usePublishResult() {
  return useDrawAction<{
    winningNumbers: string[];
  }>((id) => `/keno/draws/${id}/publish-result`, "post", "Đã công bố kết quả.");
}

export function useTriggerSettle() {
  return useDrawAction((id) => `/keno/draws/${id}/trigger-settle`, "post", "Đã bắt đầu kết sổ.");
}

export function useVoidDraw() {
  return useDrawAction<{ reason: string }>(
    (id) => `/keno/draws/${id}/void`,
    "post",
    "Đã huỷ kỳ quay.",
  );
}

export function useUpdateSchedule() {
  return useDrawAction<{ salesOpenAt: string; salesCloseAt: string; drawTime?: string }>(
    (id) => `/keno/draws/${id}/schedule`,
    "patch",
    "Đã cập nhật lịch.",
  );
}

export function usePreviewDraws(count: number) {
  return useQuery({
    queryKey: [...kenoKeys.all, "preview", count] as const,
    queryFn: () =>
      apiClient.get<PreviewDrawsOutput>("/keno/draws/preview", {
        params: { count },
      }),
    enabled: count > 0,
  });
}

export function useCreateDraw() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      draws: Array<{
        drawDate: string;
        drawNo: number;
        drawTime: string;
        openNow: boolean;
      }>;
    }) => apiClient.post<{ draws: { drawId: string }[] }>("/keno/draws", data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: kenoKeys.all });
      toast.success(`Đã tạo ${res.draws.length} kỳ quay mới.`);
    },
    onError: (err) => {
      const { title, description } = formatErrorToast(err, "Tạo kỳ quay thất bại.");
      toast.error(title, { description });
    },
  });
}

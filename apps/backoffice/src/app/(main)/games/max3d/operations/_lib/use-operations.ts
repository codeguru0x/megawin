"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, formatErrorToast } from "@megawin/next/client";
import { toast } from "sonner";
import { max3dKeys } from "@/lib/query-keys";
import type {
  OpsSummaryOutput,
  TenantBreakdownOutput,
  TripletFrequencyOutput,
  PlayTypeDistributionOutput,
  GetLiveEntriesOutput,
  GetDrawSelectorOutput,
  GetTopCombosOutput,
  GetWinningEntriesOutput,
} from "@megawin/game-max3d-application/use-cases/operations";
import type {
  GetDrawDetailOutput,
  PreviewDrawsOutput,
  CreateDrawsOutput,
} from "@megawin/game-max3d-application/use-cases/draws";

export type {
  OpsSummaryOutput,
  TenantBreakdownOutput,
  TenantBreakdownItem,
  TripletFrequencyOutput,
  TripletFrequencyItem,
  PlayTypeDistributionOutput,
  PlayTypeDistributionItem,
  GetLiveEntriesOutput,
  LiveEntryItem,
  LiveEntryBoard,
  GetDrawSelectorOutput,
  DrawSelectorItem,
  GetTopCombosOutput,
  TopSingleComboItem,
  TopPlusComboItem,
  GetWinningEntriesOutput,
  WinningEntryItem,
  WinningEntryBoard,
  WinningEntryTierDetail,
  WinningEntriesSummary,
} from "@megawin/game-max3d-application/use-cases/operations";

export type { GetDrawDetailOutput } from "@megawin/game-max3d-application/use-cases/draws";

export interface OpsQueryParams {
  financialDate?: string;
  drawId?: string;
}

const BASE = "/max3d/operations";

// ─────────────────────────────────────────────
// Preview & Create Draws — quản lý kỳ quay
// ─────────────────────────────────────────────

/**
 * Preview danh sách kỳ sẽ tạo (gợi ý theo lịch T2/T4/T6 lúc 18:00).
 * count=0 → disabled (không gọi API).
 */
export function usePreviewDraws(count: number) {
  return useQuery({
    queryKey: max3dKeys.previewDraws(count),
    queryFn: () =>
      apiClient.get<PreviewDrawsOutput>("/max3d/draws/preview", {
        params: { count },
      }),
    enabled: count > 0,
    staleTime: 30_000,
  });
}

/**
 * Tạo nhiều kỳ quay Max 3D liên tiếp.
 * Mỗi phần tử trong `draws` chứa drawDate, drawTime, openNow.
 * Invalidate toàn bộ cache max3d sau khi tạo thành công.
 */
export function useCreateDraw() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { draws: { drawDate: string; drawTime: string; openNow: boolean }[] }) =>
      apiClient.post<CreateDrawsOutput>("/max3d/draws", data),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: max3dKeys.all });
      toast.success(`Đã tạo ${result.draws.length} kỳ quay Max 3D.`);
    },
    onError: (err) => {
      const { title, description } = formatErrorToast(err, "Tạo kỳ thất bại.");
      toast.error(title, { description });
    },
  });
}

// ─────────────────────────────────────────────
// Draw Selector — danh sách kỳ quay cho dropdown
// ─────────────────────────────────────────────

/**
 * Danh sách kỳ quay cho dropdown chọn kỳ trên dashboard vận hành.
 * Refetch mỗi 30s để cập nhật trạng thái active draws.
 */
export function useDrawSelectorList() {
  return useQuery({
    queryKey: max3dKeys.opsDrawSelector,
    queryFn: () => apiClient.get<GetDrawSelectorOutput>(`${BASE}/draw-selector`),
    refetchInterval: 30_000,
  });
}

// ─────────────────────────────────────────────
// Draw Detail — chi tiết đầy đủ 1 kỳ quay
// ─────────────────────────────────────────────

/**
 * Chi tiết đầy đủ 1 kỳ: result, financial, stats.
 * Dùng để hiển thị kết quả & tài chính sau khi draw published/settled.
 * Không refetch tự động (dữ liệu ổn định sau settle).
 */
export function useDrawDetail(drawId: string | undefined) {
  return useQuery({
    queryKey: max3dKeys.drawDetail(drawId ?? ""),
    queryFn: () => apiClient.get<GetDrawDetailOutput>(`/max3d/draws/${drawId}`),
    enabled: !!drawId,
    // Sau khi settled thì không thay đổi → staleTime cao
    staleTime: 5 * 60_000,
  });
}

// ─────────────────────────────────────────────
// Operations Analytics
// ─────────────────────────────────────────────

/**
 * KPI tổng quan cược: doanh thu, entries, lines, players, commission.
 * Refetch mỗi 30s khi kỳ đang mở bán; dừng refetch khi đã settle (dữ liệu ổn định).
 */
export function useOpsSummary(params: OpsQueryParams, isSettled = false) {
  return useQuery({
    queryKey: max3dKeys.opsSummary(params as unknown as Record<string, unknown>),
    queryFn: () =>
      apiClient.get<OpsSummaryOutput>(`${BASE}/summary`, {
        params: params as unknown as Record<string, string>,
      }),
    refetchInterval: isSettled ? false : 30_000,
    staleTime: isSettled ? Infinity : 25_000,
    enabled: !!params.drawId,
  });
}

/**
 * Phân tích doanh thu theo đại lý (tenant).
 * Refetch mỗi 30s khi kỳ đang mở bán; dừng refetch khi đã settle.
 */
export function useOpsTenantBreakdown(params: OpsQueryParams, isSettled = false) {
  return useQuery({
    queryKey: max3dKeys.opsTenantBreakdown(params as unknown as Record<string, unknown>),
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
 * Tần suất bộ ba (triplet heatmap).
 * Refetch mỗi 60s khi đang active; dừng khi đã settle.
 */
export function useOpsTripletFrequency(params: OpsQueryParams, isSettled = false) {
  return useQuery({
    queryKey: max3dKeys.opsTripletFrequency(params as unknown as Record<string, unknown>),
    queryFn: () =>
      apiClient.get<TripletFrequencyOutput>(`${BASE}/triplet-frequency`, {
        params: params as unknown as Record<string, string>,
      }),
    refetchInterval: isSettled ? false : 60_000,
    staleTime: isSettled ? Infinity : 55_000,
    enabled: !!params.drawId,
  });
}

/**
 * Phân bổ theo kiểu chơi (playMode + playType): lines, entries, revenue.
 * Refetch mỗi 60s khi đang active; dừng khi đã settle.
 */
export function useOpsPlayTypeDistribution(params: OpsQueryParams, isSettled = false) {
  return useQuery({
    queryKey: max3dKeys.opsPlayTypeDistribution(params as unknown as Record<string, unknown>),
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
 * Live feed: N entries mới nhất của một kỳ quay.
 *
 * - Kỳ đang bán (isSettled=false): refetch tự động mỗi 30s
 * - Kỳ đã settle (isSettled=true): gọi 1 lần, staleTime = Infinity
 */
export function useOpsLiveEntries(drawId: string | undefined, isSettled: boolean) {
  return useQuery({
    queryKey: max3dKeys.opsLiveEntries(drawId ?? ""),
    queryFn: () =>
      apiClient.get<GetLiveEntriesOutput>(`${BASE}/live-entries`, {
        params: { drawId: drawId! },
      }),
    enabled: !!drawId,
    refetchInterval: isSettled ? false : 30_000,
    staleTime: isSettled ? Infinity : 25_000,
  });
}

/**
 * Top N bộ ba phổ biến nhất trong một kỳ quay.
 * Trả về 2 danh sách: singleCombos (basic) + plusCombos (plus).
 */
export function useOpsTopCombos(drawId: string | undefined, isSettled: boolean) {
  return useQuery({
    queryKey: max3dKeys.opsTopCombos(drawId ?? ""),
    queryFn: () =>
      apiClient.get<GetTopCombosOutput>(`${BASE}/top-combos`, {
        params: { drawId: drawId! },
      }),
    enabled: !!drawId,
    refetchInterval: isSettled ? false : 60_000,
    staleTime: isSettled ? Infinity : 55_000,
  });
}

// ─────────────────────────────────────────────
// Winning Entries — báo cáo entries trúng thưởng
// ─────────────────────────────────────────────

/**
 * Danh sách entries trúng thưởng + summary kế toán của 1 kỳ quay.
 * Chỉ fetch khi enabled=true (dialog mở). staleTime = Infinity vì kỳ đã settle.
 */
export function useWinningEntries(drawId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: max3dKeys.opsWinningEntries(drawId ?? "", "all"),
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
      qc.invalidateQueries({ queryKey: max3dKeys.all });
      toast.success(successMessage);
    },
    onError: (err) => {
      const { title, description } = formatErrorToast(err, "Thao tác thất bại.");
      toast.error(title, { description });
    },
  });
}

export function useOpenSales() {
  return useDrawAction((id) => `/max3d/draws/${id}/open-sales`, "post", "Đã mở bán vé.");
}

export function useCloseSales() {
  return useDrawAction((id) => `/max3d/draws/${id}/close-sales`, "post", "Đã đóng bán vé.");
}

/**
 * Single entry point cho nhập/sửa kết quả. Gửi `{ result, vietlottRef? }` tới
 * `/publish-result`. Backend tự quyết định publish lần đầu, sửa trước/sau settle,
 * hay chỉ cập nhật vietlottRef — và có mở luồng resettle hay không.
 */
export function usePublishResult() {
  return useDrawAction<{
    result: {
      special: [string, string];
      first: [string, string, string, string];
      second: [string, string, string, string, string, string];
      third: [string, string, string, string, string, string, string, string];
    };
    vietlottRef?: { drawPeriod: string; drawDate: string };
  }>((id) => `/max3d/draws/${id}/publish-result`, "post", "Đã công bố kết quả.");
}

export function useTriggerSettle() {
  return useDrawAction((id) => `/max3d/draws/${id}/trigger-settle`, "post", "Đã bắt đầu kết sổ.");
}

/**
 * Khởi chạy phiên Resettle — bước 2 của workflow.
 *
 * Backend sẽ acquire WorkerLock + transition `Published → Settling` + start
 * Resettle SFN. Hiển thị nút này CHỈ khi draw đã `settledAt != null` và
 * `result.publishedAt > settledAt` (đã có republish kết quả mới).
 */
export function useTriggerResettle() {
  return useDrawAction((id) => `/max3d/draws/${id}/resettle`, "post", "Đã bắt đầu kết sổ lại.");
}

export function useVoidDraw() {
  return useDrawAction<{ reason: string }>(
    (id) => `/max3d/draws/${id}/void`,
    "post",
    "Đã huỷ kỳ quay.",
  );
}

export function useUpdateSchedule() {
  return useDrawAction<{ salesOpenAt: string; salesCloseAt: string; drawTime?: string }>(
    (id) => `/max3d/draws/${id}/schedule`,
    "patch",
    "Đã cập nhật lịch.",
  );
}

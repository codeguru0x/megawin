"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, formatErrorToast } from "@megawin/next/client";
import { toast } from "sonner";
import { max3dproKeys } from "@/lib/query-keys";
import type {
  OpsSummaryOutput,
  TenantBreakdownOutput,
  TripletFrequencyOutput,
  PlayTypeDistributionOutput,
  GetLiveEntriesOutput,
  GetDrawSelectorOutput,
  GetTopCombosOutput,
  GetWinningEntriesOutput,
} from "@megawin/game-max3dpro-application/use-cases/operations";
import type {
  GetDrawDetailOutput,
  PreviewDrawsOutput,
  CreateDrawsOutput,
} from "@megawin/game-max3dpro-application/use-cases/draws";

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
  TopPairComboItem,
  GetWinningEntriesOutput,
  WinningEntryItem,
  WinningEntryBoard,
  WinningEntryTierDetail,
  WinningEntriesSummary,
} from "@megawin/game-max3dpro-application/use-cases/operations";

export type { GetDrawDetailOutput } from "@megawin/game-max3dpro-application/use-cases/draws";

export interface OpsQueryParams {
  financialDate?: string;
  drawId?: string;
}

const BASE = "/max3dpro/operations";

// ─────────────────────────────────────────────
// Preview & Create Draws — quản lý kỳ quay
// ─────────────────────────────────────────────

/**
 * Preview danh sách kỳ sẽ tạo (gợi ý theo lịch T3/T5/T7 lúc 18:00).
 * count=0 → disabled (không gọi API).
 */
export function usePreviewDraws(count: number) {
  return useQuery({
    queryKey: max3dproKeys.previewDraws(count),
    queryFn: () =>
      apiClient.get<PreviewDrawsOutput>("/max3dpro/draws/preview", {
        params: { count },
      }),
    enabled: count > 0,
    staleTime: 30_000,
  });
}

/**
 * Tạo nhiều kỳ quay Max 3D Pro liên tiếp.
 * Backend tự tính slot theo lịch T3/T5/T7, mỗi ngày 1 kỳ.
 * Invalidate toàn bộ cache max3dpro sau khi tạo thành công.
 */
export function useCreateDraw() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { draws: { drawDate: string; drawTime: string; openNow: boolean }[] }) =>
      apiClient.post<CreateDrawsOutput>("/max3dpro/draws", data),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: max3dproKeys.all });
      toast.success(`Đã tạo ${result.draws.length} kỳ quay Max 3D Pro.`);
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
    queryKey: max3dproKeys.opsDrawSelector,
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
    queryKey: max3dproKeys.drawDetail(drawId ?? ""),
    queryFn: () => apiClient.get<GetDrawDetailOutput>(`/max3dpro/draws/${drawId}`),
    enabled: !!drawId,
    // Sau khi settled thì không thay đổi → staleTime cao
    staleTime: 5 * 60_000,
  });
}

// ─────────────────────────────────────────────
// Operations Analytics
// ─────────────────────────────────────────────

/**
 * KPI tổng quan cược: doanh thu, entries, lines (TripletPair), players, commission.
 * Refetch mỗi 30s khi kỳ đang mở bán; dừng refetch khi đã settle (dữ liệu ổn định).
 */
export function useOpsSummary(params: OpsQueryParams, isSettled = false) {
  return useQuery({
    queryKey: max3dproKeys.opsSummary(params as unknown as Record<string, unknown>),
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
    queryKey: max3dproKeys.opsTenantBreakdown(params as unknown as Record<string, unknown>),
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
    queryKey: max3dproKeys.opsTripletFrequency(params as unknown as Record<string, unknown>),
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
 * Phân bổ theo kiểu chơi (multiNumber | multiDigit): lines, entries, revenue.
 * Refetch mỗi 60s khi đang active; dừng khi đã settle.
 */
export function useOpsPlayTypeDistribution(params: OpsQueryParams, isSettled = false) {
  return useQuery({
    queryKey: max3dproKeys.opsPlayTypeDistribution(params as unknown as Record<string, unknown>),
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
    queryKey: max3dproKeys.opsLiveEntries(drawId ?? ""),
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
 * Top N cặp TripletPair phổ biến nhất trong một kỳ quay.
 * Max 3D Pro chỉ có 1 loại combo (ordered pair), khác Max 3D (basic + plus).
 */
export function useOpsTopCombos(drawId: string | undefined, isSettled: boolean) {
  return useQuery({
    queryKey: max3dproKeys.opsTopCombos(drawId ?? ""),
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
    queryKey: max3dproKeys.opsWinningEntries(drawId ?? "", "all"),
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
      qc.invalidateQueries({ queryKey: max3dproKeys.all });
      toast.success(successMessage);
    },
    onError: (err) => {
      const { title, description } = formatErrorToast(err, "Thao tác thất bại.");
      toast.error(title, { description });
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
    vietlottRef?: { drawPeriod: string; drawDate: string };
  }>((id) => `/max3dpro/draws/${id}/publish-result`, "post", "Đã công bố kết quả.");
}

/**
 * Sửa kết quả của draw đã settle — bước 1 của workflow Resettle.
 *
 * CHỈ nhận `result` (20 bộ ba số) — sửa `vietlottRef` thuộc `useUpdateVietlottRef`
 * vì sửa metadata tham chiếu KHÔNG yêu cầu resettle.
 *
 * Sau khi gọi thành công, draw chuyển từ `Settled` về `Published` (data settle cũ
 * bị clear). Staff sau đó nhấn "Kết sổ lại" để chạy `useTriggerResettle`.
 */
export function useRepublishResult() {
  return useDrawAction<{
    result: {
      special: [string, string];
      first: [string, string, string, string];
      second: [string, string, string, string, string, string];
      third: [string, string, string, string, string, string, string, string];
    };
  }>((id) => `/max3dpro/draws/${id}/republish-result`, "post", "Đã cập nhật kết quả.");
}

/**
 * Cập nhật CHỈ `vietlottRef` (drawPeriod, drawDate) — KHÔNG kéo theo resettle.
 *
 * Cho phép ở status `Published`/`Settling`/`Settled`. Sửa metadata tham chiếu
 * không ảnh hưởng tới matching/payout, không cần re-run settle.
 */
export function useUpdateVietlottRef() {
  return useDrawAction<{ drawPeriod: string; drawDate: string }>(
    (id) => `/max3dpro/draws/${id}/vietlott-ref`,
    "post",
    "Đã cập nhật tham chiếu Vietlott.",
  );
}

export function useTriggerSettle() {
  return useDrawAction(
    (id) => `/max3dpro/draws/${id}/trigger-settle`,
    "post",
    "Đã bắt đầu kết sổ.",
  );
}

/**
 * Khởi chạy phiên Resettle — bước 2 của workflow.
 *
 * Backend sẽ acquire WorkerLock + transition `Published → Settling` + start
 * Resettle SFN. Hiển thị nút này CHỈ khi draw đã `settledAt != null` và
 * `result.publishedAt > settledAt` (đã có republish kết quả mới).
 */
export function useTriggerResettle() {
  return useDrawAction((id) => `/max3dpro/draws/${id}/resettle`, "post", "Đã bắt đầu kết sổ lại.");
}

export function useVoidDraw() {
  return useDrawAction<{ reason: string }>(
    (id) => `/max3dpro/draws/${id}/void`,
    "post",
    "Đã huỷ kỳ quay.",
  );
}

export function useUpdateSchedule() {
  return useDrawAction<{ salesOpenAt: string; salesCloseAt: string; drawTime?: string }>(
    (id) => `/max3dpro/draws/${id}/schedule`,
    "patch",
    "Đã cập nhật lịch.",
  );
}

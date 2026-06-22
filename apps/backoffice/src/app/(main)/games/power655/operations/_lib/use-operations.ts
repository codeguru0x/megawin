"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, formatErrorToast } from "@megawin/next/client";
import { toast } from "sonner";
import { power655Keys } from "@/lib/query-keys";
import type {
  OpsSummaryOutput,
  TenantBreakdownOutput,
  NumberFrequencyOutput,
  PlayTypeDistributionOutput,
  GetLiveEntriesOutput,
  GetDrawSelectorOutput,
  GetTopCombosOutput,
  GetWinningEntriesOutput,
} from "@megawin/game-power655-application/use-cases/operations";
import type {
  GetDrawDetailOutput,
  ResettlePreflightOutput,
} from "@megawin/game-power655-application/use-cases/draws";
import type { PreviewDrawsOutput } from "@megawin/game-power655-application/use-cases/draws";

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
  WinningEntryBoard,
  WinningEntryTierDetail,
  WinningEntriesSummary,
} from "@megawin/game-power655-application/use-cases/operations";

export type { GetDrawDetailOutput } from "@megawin/game-power655-application/use-cases/draws";
export type { ResettlePreflightOutput } from "@megawin/game-power655-application/use-cases/draws";

export interface OpsQueryParams {
  financialDate?: string;
  drawId?: string;
}

const BASE = "/power655/operations";

// ─────────────────────────────────────────────
// Draw Selector — danh sách kỳ quay cho dropdown
// ─────────────────────────────────────────────

/**
 * Danh sách kỳ quay cho dropdown chọn kỳ trên dashboard vận hành.
 * Refetch mỗi 30s để cập nhật trạng thái active draws.
 */
export function useDrawSelectorList() {
  return useQuery({
    queryKey: power655Keys.opsDrawSelector,
    queryFn: () => apiClient.get<GetDrawSelectorOutput>(`${BASE}/draw-selector`),
    refetchInterval: 30_000,
  });
}

// ─────────────────────────────────────────────
// Draw Detail — chi tiết đầy đủ 1 kỳ quay
// ─────────────────────────────────────────────

/**
 * Chi tiết đầy đủ 1 kỳ: result, jackpot snapshot, financial, stats, settleSummary.
 * Dùng để hiển thị kết quả & tài chính sau khi draw published/settled.
 */
export function useDrawDetail(drawId: string | undefined) {
  return useQuery({
    queryKey: power655Keys.drawDetail(drawId ?? ""),
    queryFn: async () => {
      const data = await apiClient.get<GetDrawDetailOutput>(`/power655/draws/${drawId}`);
      if (!data) throw new Error(`Không tìm thấy chi tiết kỳ quay: ${drawId}`);
      return data;
    },
    enabled: !!drawId,
    staleTime: 5 * 60_000,
  });
}

// ─────────────────────────────────────────────
// Operations Analytics
// ─────────────────────────────────────────────

/**
 * KPI tổng quan cược: doanh thu, entries, lines, players, commission, payout.
 * Refetch mỗi 30s khi kỳ đang mở bán; dừng refetch khi đã settle.
 */
export function useOpsSummary(params: OpsQueryParams, isSettled = false) {
  return useQuery({
    queryKey: power655Keys.opsSummary(params as unknown as Record<string, unknown>),
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
 * Refetch mỗi 30s khi kỳ đang mở bán; dừng khi đã settle.
 */
export function useOpsTenantBreakdown(params: OpsQueryParams, isSettled = false) {
  return useQuery({
    queryKey: power655Keys.opsTenantBreakdown(params as unknown as Record<string, unknown>),
    queryFn: () =>
      apiClient.get<TenantBreakdownOutput>(`${BASE}/tenant-breakdown`, {
        params: params as unknown as Record<string, string>,
      }),
    refetchInterval: isSettled ? false : 30_000,
    staleTime: isSettled ? Infinity : 25_000,
    enabled: !!params.drawId,
  });
}

/**
 * Tần suất số trong các bộ cược (heatmap 55 số).
 * Refetch mỗi 60s khi đang active; dừng khi đã settle.
 */
export function useOpsNumberFrequency(params: OpsQueryParams, isSettled = false) {
  return useQuery({
    queryKey: power655Keys.opsNumberFrequency(params as unknown as Record<string, unknown>),
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
 * Phân bổ theo kiểu chơi (PlayType): lines, entries, revenue.
 * Power 6/55 có nhiều kiểu chơi: standard, bao5, bao7-bao18.
 * Refetch mỗi 60s khi đang active; dừng khi đã settle.
 */
export function useOpsPlayTypeDistribution(params: OpsQueryParams, isSettled = false) {
  return useQuery({
    queryKey: power655Keys.opsPlayTypeDistribution(params as unknown as Record<string, unknown>),
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
    queryKey: power655Keys.opsLiveEntries(drawId ?? ""),
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
 * Top N bộ số phổ biến nhất trong một kỳ quay.
 * Refetch mỗi 60s khi kỳ đang mở bán. Kỳ đã settle: không refetch.
 */
export function useOpsTopCombos(drawId: string | undefined, isSettled: boolean) {
  return useQuery({
    queryKey: power655Keys.opsTopCombos(drawId ?? ""),
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
    queryKey: power655Keys.opsWinningEntries(drawId ?? ""),
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
      qc.invalidateQueries({ queryKey: power655Keys.all });
      toast.success(successMessage);
    },
    onError: (err) => {
      const { title, description } = formatErrorToast(err, "Thao tác thất bại.");
      toast.error(title, { description });
    },
  });
}

export function useOpenSales() {
  return useDrawAction((id) => `/power655/draws/${id}/open-sales`, "post", "Đã mở bán vé.");
}

export function useCloseSales() {
  return useDrawAction((id) => `/power655/draws/${id}/close-sales`, "post", "Đã đóng bán vé.");
}

export function usePublishResult() {
  return useDrawAction<{
    winningMain: string[];
    bonusNumber: string;
    vietlottRef?: { drawPeriod: string; drawDate: string };
  }>((id) => `/power655/draws/${id}/publish-result`, "post", "Đã công bố kết quả.");
}

export function useTriggerSettle() {
  return useDrawAction(
    (id) => `/power655/draws/${id}/trigger-settle`,
    "post",
    "Đã bắt đầu kết sổ.",
  );
}

/**
 * Khởi chạy phiên Resettle — bước 2 của workflow.
 *
 * Staff gọi SAU khi đã xem pre-flight và xác nhận kết quả mới qua publish-result.
 * Backend sẽ acquire WorkerLock + transition `Published → Settling` + start Resettle SFN.
 *
 * Hiển thị nút này CHỈ khi:
 *   - `draw.settledAt` != null (đã từng settle).
 *   - `draw.resultPublishedAt > draw.settledAt` (có kết quả mới sau settle).
 */
export function useTriggerResettle() {
  return useDrawAction<{ dbaConfirmed: boolean }>(
    (id) => `/power655/draws/${id}/resettle`,
    "post",
    "Đã bắt đầu kết sổ lại.",
  );
}

/**
 * Mở cổng resettle cho kỳ T+n trong cascade TYPE_B2 khi KẾT QUẢ SỐ KHÔNG ĐỔI.
 *
 * Cascade B2: sửa kết quả kỳ T kéo theo các kỳ đã settle sau (T+1…T+n) phải
 * re-settle vì pool dual jackpot (JP1 + JP2) đổi — nhưng số quay của chúng không
 * đổi nên không publish lại được. Hook này re-stamp `result.publishedAt` (giữ
 * winningMain + bonusNumber), chuyển `Settled → Published` để mở cổng "Kết sổ lại".
 *
 * Gọi với `dbaConfirmed: true`. Sau khi thành công, staff bấm "Kết sổ lại"
 * (useTriggerResettle) cho chính kỳ này như bình thường.
 */
export function useReopenForCascade() {
  return useDrawAction<{ dbaConfirmed: boolean }>(
    (id) => `/power655/draws/${id}/resettle-reopen`,
    "post",
    "Đã mở lại kỳ để kết sổ lại theo chuỗi.",
  );
}

/**
 * Pre-flight phân tích tác động trước khi resettle.
 *
 * Gọi với kết quả đề xuất mới (chưa publish) để detect scenario:
 *   - `TYPE_A`: tự động hoàn toàn.
 *   - `TYPE_B1`: auto payout, DBA cập nhật jackpot cycle (1 kỳ).
 *   - `TYPE_B2`: cascade từng kỳ — auto payout, DBA chốt cycle giữa mỗi bước.
 *   - `LEDGER_MISSING`: bất thường data integrity (ledger entry mất) → báo kỹ thuật.
 */
export function useResettlePreflight() {
  return useMutation({
    mutationFn: ({
      drawId,
      proposedWinningMain,
      proposedBonusNumber,
    }: {
      drawId: string;
      proposedWinningMain: string[];
      proposedBonusNumber: string;
    }) =>
      apiClient.post<ResettlePreflightOutput>(`/power655/draws/${drawId}/resettle-preflight`, {
        proposedWinningMain,
        proposedBonusNumber,
      }),
  });
}

export function useVoidDraw() {
  return useDrawAction<{ reason: string }>(
    (id) => `/power655/draws/${id}/void`,
    "post",
    "Đã huỷ kỳ quay.",
  );
}

export function useUpdateSchedule() {
  return useDrawAction<{ salesOpenAt: string; salesCloseAt: string; drawTime?: string }>(
    (id) => `/power655/draws/${id}/schedule`,
    "patch",
    "Đã cập nhật lịch.",
  );
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
    }) => apiClient.post<{ draws: { drawId: string }[] }>("/power655/draws", data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: power655Keys.all });
      toast.success(`Đã tạo ${res.draws.length} kỳ quay mới.`);
    },
    onError: (err) => {
      const { title, description } = formatErrorToast(err, "Tạo kỳ quay thất bại.");
      toast.error(title, { description });
    },
  });
}

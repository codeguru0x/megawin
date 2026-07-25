"use client";

import { useEffect } from "react";

import type {
  GetDrawDetailOutput,
  PreviewDrawsOutput,
  ResettlePreflightOutput,
} from "@megawin/game-lotto535-application/use-cases/draws";
import type {
  GetDrawSelectorOutput,
  GetLiveEntriesOutput,
  GetTopCombosOutput,
  GetWinningEntriesOutput,
  NumberFrequencyOutput,
  OpsSummaryOutput,
  PlayTypeDistributionOutput,
  TenantBreakdownOutput,
} from "@megawin/game-lotto535-application/use-cases/operations";
import type { GetEntryByIdOutput } from "@megawin/game-lotto535-application/use-cases/reports";
import { apiClient, formatErrorToast } from "@megawin/next/client";
import { Pagination } from "@megawin/shared/constants/pagination";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { lotto535Keys } from "@/lib/query-keys";

export type {
  GetDrawDetailOutput,
  ResettlePreflightOutput,
} from "@megawin/game-lotto535-application/use-cases/draws";
export type {
  DrawSelectorItem,
  GetDrawSelectorOutput,
  GetLiveEntriesOutput,
  GetTopCombosOutput,
  GetWinningEntriesOutput,
  LiveEntryBoard,
  LiveEntryItem,
  NumberFrequencyItem,
  NumberFrequencyOutput,
  OpsSummaryOutput,
  PlayTypeDistributionItem,
  PlayTypeDistributionOutput,
  TenantBreakdownItem,
  TenantBreakdownOutput,
  TopComboItem,
  WinningEntriesSummary,
  WinningEntryBoard,
  WinningEntryItem,
  WinningEntryTierDetail,
} from "@megawin/game-lotto535-application/use-cases/operations";

export interface OpsQueryParams {
  financialDate?: string;
  drawId?: string;
}

const BASE = "/lotto535/operations";

// ─────────────────────────────────────────────
// Draw Selector — danh sách kỳ quay cho dropdown
// ─────────────────────────────────────────────

/**
 * Danh sách kỳ quay cho dropdown chọn kỳ trên dashboard vận hành.
 * Refetch mỗi 30s để cập nhật trạng thái active draws.
 */
export function useDrawSelectorList() {
  return useQuery({
    queryKey: lotto535Keys.opsDrawSelector,
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
 * Không refetch tự động (dữ liệu ổn định sau settle).
 */
export function useDrawDetail(drawId: string | undefined) {
  return useQuery({
    queryKey: lotto535Keys.drawDetail(drawId ?? ""),
    queryFn: () => apiClient.get<GetDrawDetailOutput>(`/lotto535/draws/${drawId}`),
    enabled: !!drawId,
    // Sau khi settled thì không thay đổi → staleTime cao
    staleTime: 5 * 60_000,
  });
}

// ─────────────────────────────────────────────
// Operations Analytics
// ─────────────────────────────────────────────

/**
 * KPI tổng quan cược: doanh thu, entries, lines, players, commission, payout.
 * Refetch mỗi 30s khi kỳ đang mở bán; dừng refetch khi đã settle (dữ liệu ổn định).
 */
export function useOpsSummary(params: OpsQueryParams, isSettled = false) {
  return useQuery({
    queryKey: lotto535Keys.opsSummary(params as unknown as Record<string, unknown>),
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
 * Refetch mỗi 30s khi kỳ đang mở bán; dừng refetch khi đã settle (dữ liệu ổn định).
 */
export function useOpsTenantBreakdown(params: OpsQueryParams, isSettled = false) {
  return useQuery({
    queryKey: lotto535Keys.opsTenantBreakdown(params as unknown as Record<string, unknown>),
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
 * Tần suất số trong các bộ cược (heatmap).
 * Refetch mỗi 60s khi đang active; dừng khi đã settle.
 */
export function useOpsNumberFrequency(params: OpsQueryParams, isSettled = false) {
  return useQuery({
    queryKey: lotto535Keys.opsNumberFrequency(params as unknown as Record<string, unknown>),
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
 * Refetch mỗi 60s khi đang active; dừng khi đã settle.
 */
export function useOpsPlayTypeDistribution(params: OpsQueryParams, isSettled = false) {
  return useQuery({
    queryKey: lotto535Keys.opsPlayTypeDistribution(params as unknown as Record<string, unknown>),
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
    queryKey: lotto535Keys.opsLiveEntries(drawId ?? ""),
    queryFn: () =>
      apiClient.get<GetLiveEntriesOutput>(`${BASE}/live-entries`, {
        params: { drawId: drawId! },
      }),
    // Chỉ fetch khi đã chọn drawId
    enabled: !!drawId,
    // Kỳ đã settle: không cần refetch
    refetchInterval: isSettled ? false : 30_000,
    staleTime: isSettled ? Infinity : 25_000,
  });
}

/**
 * Top N bộ số phổ biến nhất trong một kỳ quay.
 *
 * Refetch mỗi 60s khi kỳ đang mở bán.
 * Kỳ đã settle: không refetch (kết quả ổn định).
 */
export function useOpsTopCombos(drawId: string | undefined, isSettled: boolean) {
  return useQuery({
    queryKey: lotto535Keys.opsTopCombos(drawId ?? ""),
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
 * Số entries mỗi trang khi load "Winning Entries" — dùng chung
 * `Pagination.Report` với backend (`GetWinningEntriesUseCase`) để 2 phía
 * luôn khớp nhau, không lệch magic number khi 1 bên đổi mà bên kia quên sửa.
 */
export const WINNING_ENTRIES_PAGE_SIZE = Pagination.Report.Size;

/**
 * Danh sách entries trúng thưởng + summary kế toán của 1 kỳ quay — infinite scroll.
 *
 * KPI (`summary`) được backend tính bằng 1 aggregate riêng quét TOÀN BỘ entries
 * trúng của kỳ (không phụ thuộc cursor/limit) → luôn chính xác dù danh sách
 * bên dưới mới load 1 trang hay đã load hết. `summary` lấy từ trang đầu tiên,
 * các trang sau server vẫn trả summary giống nhau (idempotent).
 *
 * Chỉ fetch khi enabled=true (dialog mở). staleTime = Infinity vì kỳ đã settle.
 */
export function useWinningEntries(drawId: string | undefined, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: lotto535Keys.opsWinningEntries(drawId ?? ""),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      apiClient.get<GetWinningEntriesOutput>(`${BASE}/winning-entries`, {
        params: {
          drawId: drawId!,
          limit: WINNING_ENTRIES_PAGE_SIZE,
          ...(pageParam ? { cursor: pageParam } : {}),
        },
      }),
    getNextPageParam: (last) => last.nextCursor,
    enabled: !!drawId && enabled,
    staleTime: Infinity,
  });
}

/**
 * Chi tiết đầy đủ 1 entry theo entryId — dùng khi click vào 1 dòng trong
 * Winning Entries Dialog để xem lại phiếu cược gốc (board, kết quả, giải trúng).
 * Tự báo toast lỗi khi không tìm thấy hoặc request thất bại.
 */
export function useWinningEntryDetail(entryId: string | null, { onNotFound }: { onNotFound?: () => void } = {}) {
  const query = useQuery({
    queryKey: lotto535Keys.reportEntryById(entryId ?? ""),
    queryFn: () => apiClient.get<GetEntryByIdOutput>(`/lotto535/reports/entries/${entryId}`).then((r) => r.entry),
    enabled: !!entryId,
  });

  useEffect(() => {
    if (!entryId) return;
    if (query.isError) {
      toast.error("Không thể tải thông tin phiếu cược", {
        description: "Có lỗi xảy ra khi tải dữ liệu. Vui lòng thử lại.",
      });
      onNotFound?.();
    } else if (query.isFetched && !query.isLoading && !query.data) {
      toast.error("Không tìm thấy phiếu cược", {
        description: "Phiếu cược này không còn dữ liệu hoặc đã bị xóa.",
      });
      onNotFound?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.isError, query.isFetched, query.isLoading, query.data, entryId]);

  return query;
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
      method === "post" ? apiClient.post(actionPath(drawId), body) : apiClient.patch(actionPath(drawId), body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: lotto535Keys.all });
      toast.success(successMessage);
    },
    onError: (err) => {
      const { title, description } = formatErrorToast(err, "Thao tác thất bại.");
      toast.error(title, { description });
    },
  });
}

export function useOpenSales() {
  return useDrawAction((id) => `/lotto535/draws/${id}/open-sales`, "post", "Đã mở bán vé.");
}

export function useCloseSales() {
  return useDrawAction((id) => `/lotto535/draws/${id}/close-sales`, "post", "Đã đóng bán vé.");
}

export function usePublishResult() {
  return useDrawAction<{
    winningMain: string[];
    winningSpecial: string;
    vietlottRef?: { drawPeriod: string; drawDate: string };
  }>((id) => `/lotto535/draws/${id}/publish-result`, "post", "Đã công bố kết quả.");
}

export function useTriggerSettle() {
  return useDrawAction((id) => `/lotto535/draws/${id}/trigger-settle`, "post", "Đã bắt đầu kết sổ.");
}

/**
 * Khởi chạy Resettle SFN sau khi staff đã publish kết quả mới và xem pre-flight.
 */
export function useTriggerResettle() {
  return useDrawAction<{ dbaConfirmed: boolean }>(
    (id) => `/lotto535/draws/${id}/resettle`,
    "post",
    "Đã bắt đầu kết sổ lại.",
  );
}

/**
 * Mở cổng resettle cho kỳ T+n trong cascade TYPE_B2 khi KẾT QUẢ SỐ KHÔNG ĐỔI.
 *
 * Cascade B2: sửa kết quả kỳ T kéo theo các kỳ đã settle sau (T+1…T+n) phải
 * re-settle vì pool jackpot + ranh giới split cycle đổi — nhưng số quay của chúng
 * không đổi nên không publish lại được. Hook này re-stamp `result.publishedAt`
 * (giữ winningMain + winningSpecial), chuyển `Settled → Published` để mở cổng
 * "Kết sổ lại".
 *
 * Gọi với `dbaConfirmed: true`. Sau khi thành công, staff bấm "Kết sổ lại"
 * (useTriggerResettle) cho chính kỳ này như bình thường.
 */
export function useReopenForCascade() {
  return useDrawAction<{ dbaConfirmed: boolean }>(
    (id) => `/lotto535/draws/${id}/resettle-reopen`,
    "post",
    "Đã mở lại kỳ để kết sổ lại theo chuỗi.",
  );
}

/** Pre-flight phân tích tác động trước khi resettle. */
export function useResettlePreflight() {
  return useMutation({
    mutationFn: ({
      drawId,
      proposedWinningMain,
      proposedWinningSpecial,
    }: {
      drawId: string;
      proposedWinningMain: string[];
      proposedWinningSpecial: string;
    }) =>
      apiClient.post<ResettlePreflightOutput>(`/lotto535/draws/${drawId}/resettle-preflight`, {
        proposedWinningMain,
        proposedWinningSpecial,
      }),
    onError: (err) => {
      const { title, description } = formatErrorToast(err, "Phân tích tác động thất bại.");
      toast.error(title, { description });
    },
  });
}

export function useVoidDraw() {
  return useDrawAction<{ reason: string }>((id) => `/lotto535/draws/${id}/void`, "post", "Đã huỷ kỳ quay.");
}

export function useUpdateSchedule() {
  return useDrawAction<{ salesOpenAt: string; salesCloseAt: string; drawTime?: string }>(
    (id) => `/lotto535/draws/${id}/schedule`,
    "patch",
    "Đã cập nhật lịch.",
  );
}

export function usePreviewDraws(count: number) {
  return useQuery({
    queryKey: [...lotto535Keys.all, "preview", count] as const,
    queryFn: () =>
      apiClient.get<PreviewDrawsOutput>("/lotto535/draws/preview", {
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
        drawNo: 1 | 2;
        drawTime: string;
        openNow: boolean;
      }>;
    }) => apiClient.post<{ draws: { drawId: string }[] }>("/lotto535/draws", data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: lotto535Keys.all });
      toast.success(`Đã tạo ${res.draws.length} kỳ quay mới.`);
    },
    onError: (err) => {
      const { title, description } = formatErrorToast(err, "Tạo kỳ quay thất bại.");
      toast.error(title, { description });
    },
  });
}

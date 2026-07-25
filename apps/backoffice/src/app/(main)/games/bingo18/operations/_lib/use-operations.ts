"use client";

import { useEffect, useEffectEvent } from "react";

import type { GetDrawDetailOutput } from "@megawin/game-bingo18-application/use-cases/draws";
import type {
  DiceFrequencyOutput,
  GetDrawSelectorOutput,
  GetLiveEntriesOutput,
  GetTopCombosOutput,
  GetWinningEntriesOutput,
  OpsSummaryOutput,
  PlayTypeDistributionOutput,
  TenantBreakdownOutput,
} from "@megawin/game-bingo18-application/use-cases/operations";
import type { GetEntryByIdOutput } from "@megawin/game-bingo18-application/use-cases/reports";
import { apiClient, formatErrorToast } from "@megawin/next/client";
import { Pagination } from "@megawin/shared/constants/pagination";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { bingo18Keys } from "@/lib/query-keys";

export type { GetDrawDetailOutput } from "@megawin/game-bingo18-application/use-cases/draws";
export type {
  DiceFrequencyItem,
  DiceFrequencyOutput,
  DrawSelectorItem,
  GetDrawSelectorOutput,
  GetLiveEntriesOutput,
  GetTopCombosOutput,
  GetWinningEntriesOutput,
  LiveEntryBoard,
  LiveEntryItem,
  OpsSummaryOutput,
  PlayTypeDistributionItem,
  PlayTypeDistributionOutput,
  TenantBreakdownItem,
  TenantBreakdownOutput,
  TopComboItem,
  WinningBoardDetail,
  WinningEntriesSummary,
  WinningEntryItem,
} from "@megawin/game-bingo18-application/use-cases/operations";

export interface OpsQueryParams {
  financialDate?: string;
  drawId?: string;
}

const BASE = "/bingo18/operations";

// ─────────────────────────────────────────────
// Draw Selector
// ─────────────────────────────────────────────

/**
 * Danh sách kỳ quay cho dropdown chọn kỳ.
 * Bingo 18: ~160 kỳ/ngày — group active/future/recent.
 * Refetch mỗi 15s (tần suất cao do kỳ ngắn ~6 phút).
 */
export function useDrawSelectorList() {
  return useQuery({
    queryKey: bingo18Keys.opsDrawSelector,
    queryFn: () => apiClient.get<GetDrawSelectorOutput>(`${BASE}/draw-selector`),
    refetchInterval: 15_000,
  });
}

// ─────────────────────────────────────────────
// Draw Detail
// ─────────────────────────────────────────────

/**
 * Chi tiết đầy đủ 1 kỳ: result (diceNumbers, sum), financial, stats, settleSummary.
 * Bingo 18 không có jackpot.
 */
export function useDrawDetail(drawId: string | undefined) {
  return useQuery({
    queryKey: bingo18Keys.drawDetail(drawId ?? ""),
    queryFn: () => apiClient.get<GetDrawDetailOutput>(`/bingo18/draws/${drawId}`),
    enabled: !!drawId,
    staleTime: 5 * 60_000,
  });
}

// ─────────────────────────────────────────────
// Operations Analytics
// ─────────────────────────────────────────────

/**
 * KPI tổng quan: doanh thu, entries, boards, sideBets, players, commission.
 * Bingo 18: refetch mỗi 15s; dừng khi đã settle.
 */
export function useOpsSummary(params: OpsQueryParams, isSettled = false) {
  return useQuery({
    queryKey: bingo18Keys.opsSummary(params as unknown as Record<string, unknown>),
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
 */
export function useOpsTenantBreakdown(params: OpsQueryParams, isSettled = false) {
  return useQuery({
    queryKey: bingo18Keys.opsTenantBreakdown(params as unknown as Record<string, unknown>),
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
 * Tần suất 6 mặt xúc xắc Bingo 18 (histogram giá trị 1-6).
 */
export function useOpsDiceFrequency(params: OpsQueryParams, isSettled = false) {
  return useQuery({
    queryKey: bingo18Keys.opsDiceFrequency(params as unknown as Record<string, unknown>),
    queryFn: () =>
      apiClient.get<DiceFrequencyOutput>(`${BASE}/dice-frequency`, {
        params: params as unknown as Record<string, string>,
      }),
    refetchInterval: isSettled ? false : 60_000,
    staleTime: isSettled ? Infinity : 55_000,
    enabled: !!params.drawId,
  });
}

/**
 * Phân bổ theo kiểu chơi.
 * Bingo 18: 5 kiểu — singleNum, doubleMatch, tripleMatch (basic) + sumTotal, bigSmallDraw (side bets).
 */
export function useOpsPlayTypeDistribution(params: OpsQueryParams, isSettled = false) {
  return useQuery({
    queryKey: bingo18Keys.opsPlayTypeDistribution(params as unknown as Record<string, unknown>),
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
 * Live feed: N entries mới nhất của một kỳ Bingo 18.
 * Refetch mỗi 15s khi kỳ đang bán.
 */
export function useOpsLiveEntries(drawId: string | undefined, isSettled: boolean) {
  return useQuery({
    queryKey: bingo18Keys.opsLiveEntries(drawId ?? ""),
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
 * Top N side-bet combos phổ biến nhất trong một kỳ.
 * Bingo 18: tập trung vào sumTotal và bigSmallDraw.
 */
export function useOpsTopCombos(drawId: string | undefined, isSettled: boolean) {
  return useQuery({
    queryKey: bingo18Keys.opsTopCombos(drawId ?? ""),
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
    queryKey: bingo18Keys.opsWinningEntries(drawId ?? ""),
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
 * Chi tiết đầy đủ 1 entry theo entryId — dùng cho dialog xem chi tiết từ Winning Entries Dialog.
 * Tự động toast lỗi + gọi `onNotFound` khi entry không tồn tại hoặc lỗi tải.
 */
export function useWinningEntryDetail(
  entryId: string | null,
  { onNotFound }: { onNotFound?: () => void } = {},
) {
  const query = useQuery({
    queryKey: bingo18Keys.reportEntryById(entryId ?? ""),
    queryFn: () =>
      apiClient.get<GetEntryByIdOutput>(`/bingo18/reports/entries/${entryId}`).then((r) => r.entry),
    enabled: !!entryId,
  });

  // useEffectEvent: đọc `onNotFound` mới nhất mà không cần khai báo dependency —
  // callback không nên trigger effect chạy lại.
  const onNotFoundEvent = useEffectEvent(() => {
    onNotFound?.();
  });

  useEffect(() => {
    if (!entryId) return;
    if (query.isError) {
      toast.error("Không thể tải thông tin phiếu cược", {
        description: "Có lỗi xảy ra khi tải dữ liệu. Vui lòng thử lại.",
      });
      onNotFoundEvent();
    } else if (query.isFetched && !query.isLoading && !query.data) {
      toast.error("Không tìm thấy phiếu cược", {
        description: "Phiếu cược này không còn dữ liệu hoặc đã bị xóa.",
      });
      onNotFoundEvent();
    }
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
      method === "post"
        ? apiClient.post(actionPath(drawId), body)
        : apiClient.patch(actionPath(drawId), body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: bingo18Keys.all });
      toast.success(successMessage);
    },
    onError: (err) => {
      const { title, description } = formatErrorToast(err, "Thao tác thất bại.");
      toast.error(title, { description });
    },
  });
}

export function useOpenSales() {
  return useDrawAction((id) => `/bingo18/draws/${id}/open-sales`, "post", "Đã mở bán vé.");
}

export function useCloseSales() {
  return useDrawAction((id) => `/bingo18/draws/${id}/close-sales`, "post", "Đã đóng bán vé.");
}

/**
 * Single entry point cho "nhập/sửa kết quả" Bingo 18 — gửi `numbers` +
 * `vietlottRef?` cùng lúc. Backend (`PublishResultUseCase`) tự phân biệt publish
 * lần đầu, republish sau settle (kéo resettle), hay chỉ cập nhật vietlottRef
 * (KHÔNG resettle) dựa trên `settledAt` và so sánh numbers cũ vs mới.
 */
export function usePublishResult() {
  return useDrawAction<{
    numbers: number[];
    vietlottRef?: { drawPeriod: string; drawDate: string };
  }>((id) => `/bingo18/draws/${id}/publish-result`, "post", "Đã công bố kết quả.");
}

export function useTriggerSettle() {
  return useDrawAction((id) => `/bingo18/draws/${id}/trigger-settle`, "post", "Đã bắt đầu kết sổ.");
}

/**
 * Khởi chạy phiên Resettle — bước 2 của workflow.
 *
 * Backend sẽ acquire WorkerLock + transition `Published → Settling` + start
 * Resettle SFN. Hiển thị nút này CHỈ khi draw đã `settledAt != null` và
 * `result.publishedAt > settledAt` (đã có republish kết quả mới).
 */
export function useTriggerResettle() {
  return useDrawAction((id) => `/bingo18/draws/${id}/resettle`, "post", "Đã bắt đầu kết sổ lại.");
}

export function useVoidDraw() {
  return useDrawAction<{ reason: string }>(
    (id) => `/bingo18/draws/${id}/void`,
    "post",
    "Đã huỷ kỳ quay.",
  );
}

export function useUpdateSchedule() {
  return useDrawAction<{ salesOpenAt: string; salesCloseAt: string; drawTime?: string }>(
    (id) => `/bingo18/draws/${id}/schedule`,
    "patch",
    "Đã cập nhật lịch.",
  );
}

export function usePreviewDraws(count: number) {
  return useQuery({
    queryKey: [...bingo18Keys.all, "preview", count] as const,
    queryFn: () =>
      apiClient.get<{
        draws: Array<{
          drawNo: number;
          drawDate: string;
          drawTime: string;
          closeAt: string;
          status: string;
        }>;
      }>("/bingo18/draws/preview", { params: { count } }),
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
    }) =>
      apiClient.post<{
        draws: Array<{ drawId: string; drawNo: number; drawTime: string; status: string }>;
      }>("/bingo18/draws", data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: bingo18Keys.all });
      toast.success(`Đã tạo ${res.draws.length} kỳ quay mới.`);
    },
    onError: (err) => {
      const { title, description } = formatErrorToast(err, "Tạo kỳ quay thất bại.");
      toast.error(title, { description });
    },
  });
}

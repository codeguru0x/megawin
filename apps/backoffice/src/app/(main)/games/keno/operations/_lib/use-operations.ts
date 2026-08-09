"use client";

import { useEffect, useEffectEvent } from "react";

import type { GetDrawDetailOutput, PreviewDrawsOutput } from "@megawin/game-keno-application/use-cases/draws";
import type {
  GetComboLookupOutput,
  GetDrawSelectorOutput,
  GetLiveEntriesOutput,
  GetOpsSnapshotOutput,
  GetWinningEntriesOutput,
  ListAlertsOutput,
} from "@megawin/game-keno-application/use-cases/operations";
import type { GetEntryByIdOutput } from "@megawin/game-keno-application/use-cases/reports";
import { apiClient, formatErrorToast } from "@megawin/next/client";
import { Pagination } from "@megawin/shared/constants/pagination";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { kenoKeys } from "@/lib/query-keys";

export type { GetDrawDetailOutput } from "@megawin/game-keno-application/use-cases/draws";
export type {
  AlertGroup,
  ComboLookupAccount,
  DrawSelectorItem,
  GetComboLookupOutput,
  GetDrawSelectorOutput,
  GetLiveEntriesOutput,
  GetOpsSnapshotOutput,
  GetWinningEntriesOutput,
  ListAlertsOutput,
  LiveEntryBoard,
  LiveEntryItem,
  SnapshotAlertCounts,
  WinningEntriesSummary,
  WinningEntryBoardDetail,
  WinningEntryItem,
} from "@megawin/game-keno-application/use-cases/operations";

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
 * Keno: ~120 kỳ/ngày — group active/future/recent.
 * Refetch mỗi 15s (tần suất cao hơn do kỳ ngắn ~8 phút).
 */
export function useDrawSelectorList() {
  return useQuery({
    queryKey: kenoKeys.opsDrawSelector,
    queryFn: () => apiClient.get<GetDrawSelectorOutput>(`${BASE}/draw-selector`),
    refetchInterval: 30_000,
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
// Operations Snapshot — timer 1 duy nhất (stats + alertCounts + drawStatus)
// ─────────────────────────────────────────────

/**
 * Snapshot gộp mọi số liệu vận hành 1 kỳ — **timer 1 duy nhất** (analysis §4.1).
 *
 * Thay 6 hook aggregation on-demand cũ bằng 1 findOne pre-aggregated. Nhịp poll đọc
 * TỪ CHÍNH response (`pollSeconds` = worker `ops.stats.tickSeconds`) → FE khớp cadence
 * worker, không hardcode; staff hạ tickSeconds thì FE tự theo. Fallback 10s.
 *
 * Mỗi section truyền `select` slice field của mình → section này đổi không kéo section
 * khác re-render (React Query dedupe 1 query, `select` chặn cross re-render — §4.2).
 *
 * @param drawId - Kỳ cần đọc; `undefined` → query tắt.
 * @param isSettled - Kỳ đã settle → tắt poll, `staleTime` Infinity (0 request).
 * @param select - Optional slice để giảm re-render; mặc định trả full output.
 */
export function useOpsSnapshot<TData = GetOpsSnapshotOutput>(
  drawId: string | undefined,
  isSettled: boolean,
  select?: (data: GetOpsSnapshotOutput) => TData,
) {
  return useQuery({
    queryKey: kenoKeys.opsSnapshot(drawId ?? ""),
    queryFn: () =>
      apiClient.get<GetOpsSnapshotOutput>(`${BASE}/snapshot`, {
        params: { drawId: drawId! },
      }),
    enabled: !!drawId,
    // Poll khớp nhịp worker đọc từ response; dừng hẳn khi settled.
    refetchInterval: (query) => {
      if (isSettled) return false;
      const s = query.state.data?.pollSeconds ?? 10;
      return s * 1000;
    },
    staleTime: isSettled ? Infinity : 8_000,
    select,
  });
}

// ─────────────────────────────────────────────
// Alerts (on-demand khi panel mở) + Ack mutation
// ─────────────────────────────────────────────

/**
 * List alert 1 kỳ (grouped theo type) — chỉ fetch khi panel mở (`enabled`).
 * KHÔNG timer riêng: badge count đọc từ snapshot; panel này chỉ tải chi tiết on-demand.
 */
export function useAlerts(drawId: string | undefined, status: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: kenoKeys.opsAlerts(drawId ?? "", status),
    queryFn: () =>
      apiClient.get<ListAlertsOutput>(`${BASE}/alerts`, {
        params: {
          drawId: drawId!,
          ...(status ? { status } : {}),
          grouped: "true",
        },
      }),
    enabled: !!drawId && enabled,
  });
}

/**
 * Acknowledge 1 alert. Invalidate toàn bộ Keno cache để refresh cả panel alert
 * lẫn badge count (đọc từ snapshot) — đơn giản, an toàn cho hành động ít tần suất.
 */
export function useAckAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (alertId: string) => apiClient.post(`${BASE}/alerts/${alertId}/ack`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: kenoKeys.all });
      toast.success("Đã xác nhận cảnh báo.");
    },
    onError: (err) => {
      const { title, description } = formatErrorToast(err, "Xác nhận cảnh báo thất bại.");
      toast.error(title, { description });
    },
  });
}

// ─────────────────────────────────────────────
// Combo lookup (on-demand — bấm "Kiểm tra")
// ─────────────────────────────────────────────

/**
 * Tra cứu 1 bộ số cappable (pick8/9/10) trong 1 kỳ — on-demand.
 *
 * Dùng `useMutation` cho pattern bấm-nút-mới-chạy: component đọc `.mutate/.data/.isPending`.
 * `numbers` gửi CSV ("01,05,...") — khớp `comboLookupQuerySchema` phía server.
 */
export function useComboLookup(drawId: string | undefined) {
  return useMutation({
    mutationFn: ({ playType, numbers }: { playType: string; numbers: string[] }) =>
      apiClient.get<GetComboLookupOutput>(`${BASE}/combo-lookup`, {
        params: {
          drawId: drawId!,
          playType,
          numbers: numbers.join(","),
        },
      }),
  });
}

// ─────────────────────────────────────────────
// Live feed — timer 2 (chỉ chạy khi tab Phân tích mở & kỳ chưa settle)
// ─────────────────────────────────────────────

/**
 * Live feed: N entries mới nhất của 1 kỳ Keno — **timer 2** (analysis §4.2).
 *
 * Đọc live entries (KHÔNG nằm trong stats doc) nên vẫn cần endpoint riêng.
 * `enabled` gate ở caller (`onAnalysisTab && !isSettled`) để chỉ chạy khi tab Phân
 * tích mở. Nhịp poll khớp `pollMs` (mặc định 10s) — dừng khi settled.
 */
export function useLiveFeed(drawId: string | undefined, enabled: boolean, pollMs = 10_000) {
  return useQuery({
    queryKey: kenoKeys.opsLiveEntries(drawId ?? ""),
    queryFn: () =>
      apiClient.get<GetLiveEntriesOutput>(`${BASE}/live-entries`, {
        params: { drawId: drawId! },
      }),
    enabled: !!drawId && enabled,
    refetchInterval: enabled ? pollMs : false,
    staleTime: pollMs * 0.8,
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
    queryKey: kenoKeys.opsWinningEntries(drawId ?? ""),
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
 * Winning Entries Dialog để xem lại phiếu cược gốc (board, side bet, kết quả).
 * Tự báo toast lỗi khi không tìm thấy hoặc request thất bại.
 */
export function useWinningEntryDetail(entryId: string | null, { onNotFound }: { onNotFound?: () => void } = {}) {
  const query = useQuery({
    queryKey: kenoKeys.reportEntryById(entryId ?? ""),
    queryFn: () => apiClient.get<GetEntryByIdOutput>(`/keno/reports/entries/${entryId}`).then((r) => r.entry),
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
  options?: {
    /**
     * Tắt toast lỗi mặc định. Dùng cho action hiển thị lỗi inline trong dialog
     * (settle/resettle) — dialog tự đọc `mutation.error` để render + nút "Thử lại",
     * tránh toast trùng lặp với panel lỗi trong dialog.
     */
    silentError?: boolean;
  },
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ drawId, body }: { drawId: string; body?: TBody }) =>
      method === "post" ? apiClient.post(actionPath(drawId), body) : apiClient.patch(actionPath(drawId), body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: kenoKeys.all });
      toast.success(successMessage);
    },
    onError: (err) => {
      if (options?.silentError) {
        return;
      }
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

/**
 * Single entry point cho "nhập/sửa kết quả" Keno — gửi `winningNumbers` +
 * `vietlottRef?` cùng lúc. Backend (`PublishResultUseCase`) tự phân biệt publish
 * lần đầu, republish sau settle (kéo resettle), hay chỉ cập nhật vietlottRef
 * (KHÔNG resettle) dựa trên `settledAt` và so sánh winningNumbers cũ vs mới.
 */
export function usePublishResult() {
  return useDrawAction<{
    winningNumbers: string[];
    vietlottRef?: { drawPeriod: string; drawDate: string };
  }>((id) => `/keno/draws/${id}/publish-result`, "post", "Đã công bố kết quả.");
}

export function useTriggerSettle() {
  return useDrawAction((id) => `/keno/draws/${id}/trigger-settle`, "post", "Đã bắt đầu kết sổ.", {
    silentError: true,
  });
}

/**
 * Khởi chạy phiên Resettle — bước 2 của workflow.
 *
 * Backend sẽ acquire WorkerLock + transition `Published → Settling` + start
 * Resettle SFN. Hiển thị nút này CHỈ khi draw đã `settledAt != null` và
 * `result.publishedAt > settledAt` (đã có republish kết quả mới).
 */
export function useTriggerResettle() {
  return useDrawAction((id) => `/keno/draws/${id}/resettle`, "post", "Đã bắt đầu kết sổ lại.", {
    silentError: true,
  });
}

export function useVoidDraw() {
  return useDrawAction<{ reason: string }>((id) => `/keno/draws/${id}/void`, "post", "Đã huỷ kỳ quay.");
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

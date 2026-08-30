"use client";

import { useEffect, useEffectEvent } from "react";

import type {
  GetDrawDetailOutput,
  GetVietlottSuggestionOutput,
} from "@megawin/game-bingo18-application/use-cases/draws";
import type {
  GetDrawSelectorOutput,
  GetLiveEntriesOutput,
  GetOpsSnapshotOutput,
  GetWinningEntriesOutput,
  ListAlertsOutput,
} from "@megawin/game-bingo18-application/use-cases/operations";
import type { GetEntryByIdOutput } from "@megawin/game-bingo18-application/use-cases/reports";
import { apiClient, formatErrorToast } from "@megawin/next/client";
import { Pagination } from "@megawin/shared/constants/pagination";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { bingo18Keys } from "@/lib/query-keys";

export type { GetDrawDetailOutput } from "@megawin/game-bingo18-application/use-cases/draws";
export type {
  AlertGroup,
  DrawSelectorItem,
  GetDrawSelectorOutput,
  GetLiveEntriesOutput,
  GetOpsSnapshotOutput,
  GetWinningEntriesOutput,
  ListAlertsOutput,
  LiveEntryBoard,
  LiveEntryItem,
  SnapshotAlertCounts,
  SnapshotThresholds,
  WinningBoardDetail,
  WinningEntriesSummary,
  WinningEntryItem,
} from "@megawin/game-bingo18-application/use-cases/operations";

const BASE = "/bingo18/operations";

// ─────────────────────────────────────────────
// Draw Selector
// ─────────────────────────────────────────────

/**
 * Danh sách kỳ quay cho dropdown chọn kỳ.
 * Bingo 18: ~158 kỳ/ngày — group active/future/recent.
 * Refetch mỗi 15s (tần suất cao do kỳ ngắn ~6 phút).
 */
export function useDrawSelectorList() {
  return useQuery({
    queryKey: bingo18Keys.opsDrawSelector,
    queryFn: () => apiClient.get<GetDrawSelectorOutput>(`${BASE}/draw-selector`),
    refetchInterval: 30_000,
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
// Vietlott Suggestion — gợi ý mã kỳ cho dialog publish (on-demand khi dialog mở)
// ─────────────────────────────────────────────

/**
 * Gợi ý `vietlottRef.drawPeriod` cho dialog công bố kết quả — chỉ fetch khi dialog
 * mở (`enabled`). Không poll: neo + lịch quay hiếm khi đổi giữa lúc dialog đang mở.
 */
export function useVietlottSuggestion(drawId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: bingo18Keys.vietlottSuggestion(drawId ?? ""),
    queryFn: () => apiClient.get<GetVietlottSuggestionOutput>(`/bingo18/draws/${drawId}/vietlott-suggestion`),
    enabled: !!drawId && enabled,
    staleTime: 60_000,
  });
}

// ─────────────────────────────────────────────
// Operations Snapshot — timer 1 duy nhất (stats + exposure + alertCounts + drawStatus)
// ─────────────────────────────────────────────

/**
 * Snapshot gộp mọi số liệu vận hành 1 kỳ — **timer 1 duy nhất** (analysis §4.1).
 *
 * Thay 5 hook aggregation on-demand cũ (summary/tenant/diceFreq/playtype/topCombos)
 * bằng 1 findOne pre-aggregated. Nhịp poll đọc TỪ CHÍNH response (`pollSeconds` =
 * worker `ops.stats.tickSeconds`) → FE khớp cadence worker, không hardcode. Fallback 10s.
 *
 * Mỗi section truyền `select` slice field của mình → section này đổi không kéo section
 * khác re-render (React Query dedupe 1 query, `select` chặn cross re-render).
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
    queryKey: bingo18Keys.opsSnapshot(drawId ?? ""),
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
 * Trả CẢ item `ack` — UI v6: render dưới disclosure per-group (guideline §4).
 */
export function useAlerts(drawId: string | undefined, status: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: bingo18Keys.opsAlerts(drawId ?? "", status),
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
 * Acknowledge 1 alert. Invalidate toàn bộ Bingo 18 cache để refresh cả panel alert
 * lẫn badge count (đọc từ snapshot) — đơn giản, an toàn cho hành động ít tần suất.
 */
export function useAckAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (alertId: string) => apiClient.post(`${BASE}/alerts/${alertId}/ack`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: bingo18Keys.all });
      toast.success("Đã xác nhận cảnh báo.");
    },
    onError: (err) => {
      const { title, description } = formatErrorToast(err, "Xác nhận cảnh báo thất bại.");
      toast.error(title, { description });
    },
  });
}

// ─────────────────────────────────────────────
// Live feed — timer 2 (chỉ chạy khi tab Phân tích mở & kỳ chưa settle)
// ─────────────────────────────────────────────

/**
 * Live feed: N entries mới nhất của một kỳ Bingo 18 — **timer 2**.
 *
 * Đọc live entries (KHÔNG nằm trong stats doc) nên vẫn cần endpoint riêng.
 * `enabled` gate ở caller (tab Phân tích mở && chưa settle) — tab Giám sát chỉ có
 * đúng 1 timer snapshot.
 */
export function useOpsLiveEntries(drawId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: bingo18Keys.opsLiveEntries(drawId ?? ""),
    queryFn: () =>
      apiClient.get<GetLiveEntriesOutput>(`${BASE}/live-entries`, {
        params: { drawId: drawId! },
      }),
    enabled: !!drawId && enabled,
    refetchInterval: enabled ? 10_000 : false,
    staleTime: 8_000,
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
export function useWinningEntryDetail(entryId: string | null, { onNotFound }: { onNotFound?: () => void } = {}) {
  const query = useQuery({
    queryKey: bingo18Keys.reportEntryById(entryId ?? ""),
    queryFn: () => apiClient.get<GetEntryByIdOutput>(`/bingo18/reports/entries/${entryId}`).then((r) => r.entry),
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
      method === "post" ? apiClient.post(actionPath(drawId), body) : apiClient.patch(actionPath(drawId), body),
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
  return useDrawAction<{ reason: string }>((id) => `/bingo18/draws/${id}/void`, "post", "Đã huỷ kỳ quay.");
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

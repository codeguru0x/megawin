"use client";

import { useEffect, useEffectEvent } from "react";

import type {
  GetDrawDetailOutput,
  GetVietlottResultOutput,
  GetVietlottSuggestionOutput,
  PreviewDrawsOutput,
  ResettlePreflightOutput,
} from "@megawin/game-lotto535-application/use-cases/draws";
import type {
  GetComboLookupOutput,
  GetDrawSelectorOutput,
  GetLiveEntriesOutput,
  GetOpsSnapshotOutput,
  GetWinningEntriesOutput,
  ListAlertsOutput,
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
  GetComboLookupOutput,
  GetDrawSelectorOutput,
  GetLiveEntriesOutput,
  GetOpsSnapshotOutput,
  GetWinningEntriesOutput,
  ListAlertsOutput,
  LiveEntryBoard,
  LiveEntryItem,
  Lotto535AlertGroup,
  Lotto535ComboLookupAccount,
  Lotto535SnapshotExposure,
  Lotto535SnapshotThresholds,
  Lotto535TopCombo,
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
// Vietlott Period Suggestion — gợi ý mã kỳ cho dialog publish (P3)
// ─────────────────────────────────────────────

/**
 * Gợi ý mã kỳ Vietlott (`vietlottRef.drawPeriod`) — chỉ fetch khi dialog công bố kết
 * quả đang mở (`enabled`). Đọc neo + lịch quay từ config DB phía server, không tính
 * gì ở client (overview §4.4).
 */
export function useVietlottSuggestion(drawId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: lotto535Keys.vietlottSuggestion(drawId ?? ""),
    queryFn: () => apiClient.get<GetVietlottSuggestionOutput>(`/lotto535/draws/${drawId}/vietlott-suggestion`),
    enabled: !!drawId && enabled,
    staleTime: 60_000,
  });
}

/**
 * Tự lấy kết quả Vietlott đã publish (ResultFeed) theo `drawPeriod` — dùng để tự điền form
 * công bố/sửa kết quả. `queryKey` gồm `drawPeriod`: đổi mã kỳ (user tự sửa ô input) tự động
 * tạo query khác, tự refetch.
 */
export function useVietlottResult(drawId: string | undefined, drawPeriod: string, enabled: boolean) {
  return useQuery({
    queryKey: lotto535Keys.vietlottResult(drawId ?? "", drawPeriod),
    queryFn: () =>
      apiClient.get<GetVietlottResultOutput>(`/lotto535/draws/${drawId}/vietlott-result`, {
        params: { drawPeriod },
      }),
    enabled: !!drawId && !!drawPeriod && enabled,
    staleTime: 30_000,
  });
}

// ─────────────────────────────────────────────
// Operations Snapshot — timer 1 duy nhất (stats + numberStats + top-K + alertCounts)
// ─────────────────────────────────────────────

/**
 * Snapshot gộp mọi số liệu vận hành 1 kỳ — **timer 1 duy nhất** (analysis §5.2, mirror
 * Power 6/55 D2).
 *
 * Thay 5 hook aggregation on-demand cũ (summary/tenant-breakdown/number-frequency/
 * playtype-distribution/top-combos) bằng 1 findOne pre-aggregated + vài query top-K
 * index-only. Nhịp poll đọc TỪ CHÍNH response (`pollSeconds` = worker `ops.stats.tickSeconds`)
 * — FE khớp cadence worker, không hardcode; staff hạ tickSeconds thì FE tự theo. Fallback 10s.
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
    queryKey: lotto535Keys.opsSnapshot(drawId ?? ""),
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
    queryKey: lotto535Keys.opsAlerts(drawId ?? "", status),
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
 * Acknowledge 1 alert. Invalidate toàn bộ Lotto 5/35 cache để refresh cả panel alert
 * lẫn badge count (đọc từ snapshot) — đơn giản, an toàn cho hành động ít tần suất.
 */
export function useAckAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (alertId: string) => apiClient.post(`${BASE}/alerts/${alertId}/ack`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: lotto535Keys.all });
      toast.success("Đã xác nhận cảnh báo.");
    },
    onError: (err) => {
      const { title, description } = formatErrorToast(err, "Xác nhận cảnh báo thất bại.");
      toast.error(title, { description });
    },
  });
}

// ─────────────────────────────────────────────
// Combo lookup (on-demand — bấm "Tra cứu")
// ─────────────────────────────────────────────

/**
 * Tra cứu 1 board (bộ số theo playType) trong 1 kỳ — on-demand.
 *
 * Dùng `useMutation` cho pattern bấm-nút-mới-chạy. `mainNumbers`/`specialNumbers` gửi
 * CSV riêng ("01,05,...") — khớp `comboLookupQuerySchema` phía server (Lotto 5/35 luôn
 * có 2 chiều số, KHÁC Power 6/55 chỉ 1 chiều). `playType` TỰ SUY ở UI theo số lượng số
 * đã chọn (4+1/5+1/6..15+1/5+2..12).
 */
export function useComboLookup(drawId: string | undefined) {
  return useMutation({
    mutationFn: ({
      playType,
      mainNumbers,
      specialNumbers,
    }: {
      playType: string;
      mainNumbers: string[];
      specialNumbers: string[];
    }) =>
      apiClient.get<GetComboLookupOutput>(`${BASE}/combo-lookup`, {
        params: {
          drawId: drawId!,
          playType,
          mainNumbers: mainNumbers.join(","),
          specialNumbers: specialNumbers.join(","),
        },
      }),
  });
}

// ─────────────────────────────────────────────
// Live feed — DÙNG CHUNG nhịp `tickSeconds` với snapshot (analysis §5.2)
// ─────────────────────────────────────────────

/** Nhịp poll fallback (ms) khi snapshot chưa trả về `pollSeconds` — khớp default `ops.stats.tickSeconds`. */
const LIVE_FEED_FALLBACK_MS = 10_000;

/**
 * Live feed: N entries mới nhất của 1 kỳ.
 *
 * Đọc live entries (KHÔNG nằm trong stats doc) nên vẫn cần endpoint riêng, nhưng
 * **DÙNG CHUNG nhịp `tickSeconds`** với snapshot (mirror Power 6/55 D2). Caller truyền
 * `pollSeconds` lấy TỪ CHÍNH snapshot (`snapshot.pollSeconds`); staff hạ tickSeconds thì
 * live feed tự theo.
 *
 * `enabled` gate ở caller (`onAnalysisTab && !isSettled`) để chỉ chạy khi tab Phân tích mở.
 *
 * @param drawId - Kỳ cần đọc; `undefined` → query tắt.
 * @param isSettled - Kỳ đã settle → dừng poll, `staleTime` Infinity.
 * @param pollSeconds - Nhịp chung từ snapshot (giây); `undefined` → fallback 10s.
 */
export function useOpsLiveEntries(drawId: string | undefined, isSettled: boolean, pollSeconds: number | undefined) {
  const pollMs = pollSeconds ? pollSeconds * 1000 : LIVE_FEED_FALLBACK_MS;
  return useQuery({
    queryKey: lotto535Keys.opsLiveEntries(drawId ?? ""),
    queryFn: () =>
      apiClient.get<GetLiveEntriesOutput>(`${BASE}/live-entries`, {
        params: { drawId: drawId! },
      }),
    enabled: !!drawId,
    refetchInterval: isSettled ? false : pollMs,
    staleTime: isSettled ? Infinity : pollMs * 0.8,
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

"use client";

import { useEffect, useEffectEvent } from "react";

import type {
  GetDrawDetailOutput,
  PreviewDrawsOutput,
  ResettlePreflightOutput,
} from "@megawin/game-power655-application/use-cases/draws";
import type {
  GetComboLookupOutput,
  GetDrawSelectorOutput,
  GetLiveEntriesOutput,
  GetOpsSnapshotOutput,
  GetWinningEntriesOutput,
  ListAlertsOutput,
} from "@megawin/game-power655-application/use-cases/operations";
import type { GetEntryByIdOutput } from "@megawin/game-power655-application/use-cases/reports";
import { apiClient, formatErrorToast } from "@megawin/next/client";
import { Pagination } from "@megawin/shared/constants/pagination";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { power655Keys } from "@/lib/query-keys";

export type {
  GetDrawDetailOutput,
  ResettlePreflightOutput,
} from "@megawin/game-power655-application/use-cases/draws";
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
  Power655AlertGroup,
  Power655ComboLookupAccount,
  Power655SnapshotExposure,
  Power655SnapshotThresholds,
  Power655TopCombo,
  WinningEntriesSummary,
  WinningEntryBoard,
  WinningEntryItem,
  WinningEntryTierDetail,
} from "@megawin/game-power655-application/use-cases/operations";

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
// Operations Snapshot — timer 1 duy nhất (stats + numberStats + top-K + alertCounts)
// ─────────────────────────────────────────────

/**
 * Snapshot gộp mọi số liệu vận hành 1 kỳ — **timer 1 duy nhất** (analysis §5.2, D2).
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
    queryKey: power655Keys.opsSnapshot(drawId ?? ""),
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
export function useAlerts(
  drawId: string | undefined,
  status: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: power655Keys.opsAlerts(drawId ?? "", status),
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
 * Acknowledge 1 alert. Invalidate toàn bộ Power 6/55 cache để refresh cả panel alert
 * lẫn badge count (đọc từ snapshot) — đơn giản, an toàn cho hành động ít tần suất.
 */
export function useAckAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (alertId: string) => apiClient.post(`${BASE}/alerts/${alertId}/ack`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: power655Keys.all });
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
 * Dùng `useMutation` cho pattern bấm-nút-mới-chạy. `numbers` gửi CSV ("01,05,...") — khớp
 * `comboLookupQuerySchema` phía server. `playType` TỰ SUY ở UI theo số lượng số đã chọn.
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
// Live feed — DÙNG CHUNG nhịp `tickSeconds` với snapshot (analysis §5.2, §6.1-D2)
// ─────────────────────────────────────────────

/** Nhịp poll fallback (ms) khi snapshot chưa trả về `pollSeconds` — khớp default `ops.stats.tickSeconds`. */
const LIVE_FEED_FALLBACK_MS = 10_000;

/**
 * Live feed: N entries mới nhất của 1 kỳ.
 *
 * Đọc live entries (KHÔNG nằm trong stats doc) nên vẫn cần endpoint riêng, nhưng
 * **DÙNG CHUNG nhịp `tickSeconds`** với snapshot (analysis §5.2, §6.1-D2 — KHÁC Keno vốn
 * chạy live 10s riêng): Power 6/55 entry rải rác trong 3 ngày bán, 2 nhịp riêng không thêm
 * giá trị → gộp 1 nhịp cho toàn trang refresh cùng chu kỳ. Caller truyền `pollSeconds` lấy
 * TỪ CHÍNH snapshot (`snapshot.pollSeconds`); staff hạ tickSeconds thì live feed tự theo.
 *
 * `enabled` gate ở caller (`onAnalysisTab && !isSettled`) để chỉ chạy khi tab Phân tích mở.
 *
 * @param drawId - Kỳ cần đọc; `undefined` → query tắt.
 * @param isSettled - Kỳ đã settle → dừng poll, `staleTime` Infinity.
 * @param pollSeconds - Nhịp chung từ snapshot (giây); `undefined` → fallback 10s.
 */
export function useOpsLiveEntries(
  drawId: string | undefined,
  isSettled: boolean,
  pollSeconds: number | undefined,
) {
  const pollMs = pollSeconds ? pollSeconds * 1000 : LIVE_FEED_FALLBACK_MS;
  return useQuery({
    queryKey: power655Keys.opsLiveEntries(drawId ?? ""),
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
    queryKey: power655Keys.opsWinningEntries(drawId ?? ""),
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
export function useWinningEntryDetail(
  entryId: string | null,
  { onNotFound }: { onNotFound?: () => void } = {},
) {
  const query = useQuery({
    queryKey: power655Keys.reportEntryById(entryId ?? ""),
    queryFn: () =>
      apiClient
        .get<GetEntryByIdOutput>(`/power655/reports/entries/${entryId}`)
        .then((r) => r.entry),
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
 *   - `draw.drawResultAt > draw.settledAt` (có kết quả mới sau settle).
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

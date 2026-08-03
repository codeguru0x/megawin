"use client";

import { useEffect, useEffectEvent } from "react";

import type {
  CreateDrawsOutput,
  GetDrawDetailOutput,
  PreviewDrawsOutput,
} from "@megawin/game-max3dpro-application/use-cases/draws";
import type {
  GetDrawSelectorOutput,
  GetLiveEntriesOutput,
  GetOpsSnapshotOutput,
  GetWinningEntriesOutput,
  ListAlertsOutput,
} from "@megawin/game-max3dpro-application/use-cases/operations";
import type { GetEntryByIdOutput } from "@megawin/game-max3dpro-application/use-cases/reports";
import { apiClient, formatErrorToast } from "@megawin/next/client";
import { Pagination } from "@megawin/shared/constants/pagination";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { max3dproKeys } from "@/lib/query-keys";

export type { GetDrawDetailOutput } from "@megawin/game-max3dpro-application/use-cases/draws";
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
  WinningEntriesSummary,
  WinningEntryBoard,
  WinningEntryItem,
  WinningEntryTierDetail,
} from "@megawin/game-max3dpro-application/use-cases/operations";

const BASE = "/max3dpro/operations";

// ─────────────────────────────────────────────
// Preview & Create Draws — quản lý kỳ quay
// ─────────────────────────────────────────────

/**
 * Preview danh sách kỳ sẽ tạo (gợi ý theo lịch T2/T4/T6 lúc 18:00).
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
 * Mỗi phần tử trong `draws` chứa drawDate, drawTime, openNow.
 * Invalidate toàn bộ cache max3d sau khi tạo thành công.
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
// Operations Snapshot — timer 1 duy nhất (stats + exposure + alertCounts + drawStatus)
// ─────────────────────────────────────────────

/**
 * Snapshot gộp mọi số liệu vận hành 1 kỳ — **timer 1 duy nhất** (analysis §4.1).
 *
 * Thay 6 hook aggregation on-demand cũ (summary/tenant/tripletFreq/playtype/topCombos)
 * bằng 1 findOne pre-aggregated. Nhịp poll đọc TỪ CHÍNH response (`pollSeconds` =
 * worker `ops.stats.tickSeconds`, Max 3D Pro default 30s) → FE khớp cadence worker.
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
    queryKey: max3dproKeys.opsSnapshot(drawId ?? ""),
    queryFn: () =>
      apiClient.get<GetOpsSnapshotOutput>(`${BASE}/snapshot`, {
        params: { drawId: drawId! },
      }),
    enabled: !!drawId,
    // Poll khớp nhịp worker đọc từ response; dừng hẳn khi settled.
    refetchInterval: (query) => {
      if (isSettled) return false;
      const s = query.state.data?.pollSeconds ?? 30;
      return s * 1000;
    },
    staleTime: isSettled ? Infinity : 25_000,
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
export function useAlerts(
  drawId: string | undefined,
  status: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: max3dproKeys.opsAlerts(drawId ?? "", status),
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
 * Acknowledge 1 alert. Invalidate toàn bộ Max 3D Pro cache để refresh cả panel alert
 * lẫn badge count (đọc từ snapshot) — đơn giản, an toàn cho hành động ít tần suất.
 */
export function useAckAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (alertId: string) => apiClient.post(`${BASE}/alerts/${alertId}/ack`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: max3dproKeys.all });
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
 * Live feed: N entries mới nhất của một kỳ Max 3D Pro — **timer 2**.
 * Đọc live entries (KHÔNG nằm trong stats doc) nên vẫn cần endpoint riêng.
 * `enabled` gate ở caller (tab Phân tích mở && chưa settle).
 */
export function useOpsLiveEntries(drawId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: max3dproKeys.opsLiveEntries(drawId ?? ""),
    queryFn: () =>
      apiClient.get<GetLiveEntriesOutput>(`${BASE}/live-entries`, {
        params: { drawId: drawId! },
      }),
    enabled: !!drawId && enabled,
    refetchInterval: enabled ? 30_000 : false,
    staleTime: 25_000,
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
    queryKey: max3dproKeys.opsWinningEntries(drawId ?? ""),
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
    queryKey: max3dproKeys.reportEntryById(entryId ?? ""),
    queryFn: () => apiClient.get<GetEntryByIdOutput>(`/max3dpro/reports/entries/${entryId}`).then((r) => r.entry),
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
  }>((id) => `/max3dpro/draws/${id}/publish-result`, "post", "Đã công bố kết quả.");
}

export function useTriggerSettle() {
  return useDrawAction((id) => `/max3dpro/draws/${id}/trigger-settle`, "post", "Đã bắt đầu kết sổ.");
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
  return useDrawAction<{ reason: string }>((id) => `/max3dpro/draws/${id}/void`, "post", "Đã huỷ kỳ quay.");
}

export function useUpdateSchedule() {
  return useDrawAction<{ salesOpenAt: string; salesCloseAt: string; drawTime?: string }>(
    (id) => `/max3dpro/draws/${id}/schedule`,
    "patch",
    "Đã cập nhật lịch.",
  );
}

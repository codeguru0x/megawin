"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiClient } from "@megawin/next/client";
import { Pagination } from "@megawin/shared/constants";
import { lotto535Keys } from "@/lib/query-keys";
import type {
  GetJackpotCurrentOutput,
  ListJackpotCyclesOutput,
  ListJackpotHistoryByCycleOutput,
  ListAllJackpotCycleOptionsOutput,
} from "@megawin/game-lotto535-application/use-cases/jackpot";
import type { GetEntryByIdOutput } from "@megawin/game-lotto535-application/use-cases/reports";

export type {
  GetJackpotCurrentOutput,
  ListJackpotCyclesOutput,
  ListJackpotHistoryByCycleOutput,
  ListAllJackpotCycleOptionsOutput,
};
export type {
  JackpotHistoryItem,
  JackpotCycleSummary,
  JackpotWinnerSummary,
  JackpotCycleOption,
} from "@megawin/game-lotto535-application/use-cases/jackpot";

export function useJackpotCurrent() {
  return useQuery({
    queryKey: lotto535Keys.jackpotCurrent,
    queryFn: () => apiClient.get<GetJackpotCurrentOutput>("/lotto535/jackpot/current"),
    refetchInterval: 30_000,
  });
}

/** Danh sách tất cả vòng Jackpot — dùng cho cycle selector dropdown. */
export function useJackpotCycleOptions() {
  return useQuery({
    queryKey: lotto535Keys.jackpotCycleOptions,
    queryFn: () =>
      apiClient.get<ListAllJackpotCycleOptionsOutput>("/lotto535/jackpot/cycle-options"),
    // Cycles không thay đổi thường xuyên — stale sau 60s
    staleTime: 60_000,
  });
}

export interface JackpotHistoryByCycleParams {
  /** cycleNo = 0 → vòng đang active (current). */
  cycleNo: number;
  page: number;
}

/** Lịch sử draws trong 1 vòng Jackpot cụ thể, có phân trang. */
export function useJackpotHistoryByCycle(params: JackpotHistoryByCycleParams) {
  const size = Pagination.Default.Size;
  return useQuery({
    queryKey: lotto535Keys.jackpotHistoryByCycle({
      cycleNo: params.cycleNo,
      page: params.page,
      size,
    }),
    queryFn: () =>
      apiClient.get<ListJackpotHistoryByCycleOutput>("/lotto535/jackpot/history-by-cycle", {
        params: { cycleNo: params.cycleNo, page: params.page, size },
      }),
  });
}

export interface JackpotCyclesParams {
  page: number;
  /** Số vòng mỗi trang. Mặc định dùng Pagination.Default.Size. */
  size?: number;
}

export function useJackpotCycles(params: JackpotCyclesParams) {
  const size = params.size ?? Pagination.Default.Size;
  return useQuery({
    queryKey: lotto535Keys.jackpotCycles({ page: params.page, size }),
    queryFn: () =>
      apiClient.get<ListJackpotCyclesOutput>("/lotto535/jackpot/cycles", {
        params: { page: params.page, size },
      }),
  });
}

/**
 * Lấy chi tiết 1 entry by ID — dùng cho dialog chi tiết jackpot winner.
 * Tự báo toast lỗi khi không tìm thấy hoặc request thất bại.
 * `onNotFound` được gọi để component có thể đóng dialog.
 */
export function useJackpotEntryDetail(
  entryId: string | null,
  { onNotFound }: { onNotFound?: () => void } = {},
) {
  const query = useQuery({
    queryKey: lotto535Keys.reportEntryById(entryId ?? ""),
    queryFn: () =>
      apiClient
        .get<GetEntryByIdOutput>(`/lotto535/reports/entries/${entryId}`)
        .then((r) => r.entry),
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

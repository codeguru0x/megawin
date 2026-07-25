"use client";

import { useEffect, useEffectEvent } from "react";

import type {
  GetJackpotCurrentOutput,
  ListAllJackpotCycleOptionsOutput,
  ListJackpotCyclesOutput,
  ListJackpotHistoryByCycleOutput,
} from "@megawin/game-power655-application/use-cases/jackpot";
import type { GetEntryByIdOutput } from "@megawin/game-power655-application/use-cases/reports";
import { apiClient } from "@megawin/next/client";
import { Pagination } from "@megawin/shared/constants";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { power655Keys } from "@/lib/query-keys";

export type {
  JackpotCycleOption,
  JackpotCycleSummary,
  JackpotHistoryItem,
  JackpotWinnerSummary,
} from "@megawin/game-power655-application/use-cases/jackpot";

export type {
  GetJackpotCurrentOutput,
  ListAllJackpotCycleOptionsOutput,
  ListJackpotCyclesOutput,
  ListJackpotHistoryByCycleOutput,
};

export function useJackpotCurrent() {
  return useQuery({
    queryKey: power655Keys.jackpotCurrent,
    queryFn: () => apiClient.get<GetJackpotCurrentOutput>("/power655/jackpot/current"),
    refetchInterval: 30_000,
  });
}

/** Lấy danh sách cycle options cho selector "Lịch sử Jackpot" (tối đa 10 vòng). */
export function useJackpotCycleOptions() {
  return useQuery({
    queryKey: power655Keys.jackpotCycleOptions,
    queryFn: () =>
      apiClient.get<ListAllJackpotCycleOptionsOutput>("/power655/jackpot/cycle-options"),
  });
}

export interface JackpotHistoryByCycleParams {
  cycleNo: number;
  page: number;
}

/** Lấy lịch sử draws theo jackpot cycle đã chọn, phân trang. */
export function useJackpotHistoryByCycle(params: JackpotHistoryByCycleParams) {
  const size = Pagination.Default.Size;
  return useQuery({
    queryKey: power655Keys.jackpotHistoryByCycle({
      cycleNo: params.cycleNo,
      page: params.page,
      size,
    }),
    queryFn: () =>
      apiClient.get<ListJackpotHistoryByCycleOutput>("/power655/jackpot/history-by-cycle", {
        params: { cycleNo: params.cycleNo, page: params.page, size },
      }),
    enabled: params.cycleNo > 0,
  });
}

export interface JackpotCyclesParams {
  page: number;
  size?: number;
}

export function useJackpotCycles(params: JackpotCyclesParams) {
  const size = params.size ?? Pagination.Default.Size;
  return useQuery({
    queryKey: power655Keys.jackpotCycles({ page: params.page, size }),
    queryFn: () =>
      apiClient.get<ListJackpotCyclesOutput>("/power655/jackpot/cycles", {
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

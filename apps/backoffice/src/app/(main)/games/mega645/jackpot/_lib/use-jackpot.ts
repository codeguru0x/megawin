"use client";

import { useEffect, useEffectEvent } from "react";

import type {
  GetJackpotCurrentOutput,
  ListAllJackpotCycleOptionsOutput,
  ListJackpotCyclesOutput,
  ListJackpotHistoryByCycleOutput,
} from "@megawin/game-mega645-application/use-cases/jackpot";
import type { GetEntryByIdOutput } from "@megawin/game-mega645-application/use-cases/reports";
import { apiClient } from "@megawin/next/client";
import { Pagination } from "@megawin/shared/constants";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { mega645Keys } from "@/lib/query-keys";

export type {
  JackpotCycleOption,
  JackpotCycleSummary,
  JackpotHistoryItem,
  JackpotWinnerSummary,
} from "@megawin/game-mega645-application/use-cases/jackpot";

export type {
  GetJackpotCurrentOutput,
  ListAllJackpotCycleOptionsOutput,
  ListJackpotCyclesOutput,
  ListJackpotHistoryByCycleOutput,
};

export function useJackpotCurrent() {
  return useQuery({
    queryKey: mega645Keys.jackpotCurrent,
    queryFn: () => apiClient.get<GetJackpotCurrentOutput>("/mega645/jackpot/current"),
    refetchInterval: 30_000,
  });
}

/** Danh sách tất cả vòng Jackpot — dùng cho cycle selector dropdown. */
export function useJackpotCycleOptions() {
  return useQuery({
    queryKey: mega645Keys.jackpotCycleOptions,
    queryFn: () => apiClient.get<ListAllJackpotCycleOptionsOutput>("/mega645/jackpot/cycle-options"),
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
    queryKey: mega645Keys.jackpotHistoryByCycle({
      cycleNo: params.cycleNo,
      page: params.page,
      size,
    }),
    queryFn: () =>
      apiClient.get<ListJackpotHistoryByCycleOutput>("/mega645/jackpot/history-by-cycle", {
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
    queryKey: mega645Keys.jackpotCycles({ page: params.page, size } as unknown as Record<string, unknown>),
    queryFn: () =>
      apiClient.get<ListJackpotCyclesOutput>("/mega645/jackpot/cycles", {
        params: { page: params.page, size },
      }),
  });
}

/**
 * Lấy chi tiết 1 entry by ID — dùng cho dialog chi tiết jackpot winner.
 * Tự báo toast lỗi khi không tìm thấy hoặc request thất bại.
 * `onNotFound` được gọi để component có thể đóng dialog.
 */
export function useJackpotEntryDetail(entryId: string | null, { onNotFound }: { onNotFound?: () => void } = {}) {
  const query = useQuery({
    queryKey: mega645Keys.reportEntryById(entryId ?? ""),
    queryFn: () => apiClient.get<GetEntryByIdOutput>(`/mega645/reports/entries/${entryId}`).then((r) => r.entry),
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

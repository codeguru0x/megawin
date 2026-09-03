"use client";

import { ApiClientError, apiClient } from "@megawin/next/client";
import type {
  AlertEntity,
  ConsensusEntity,
  ObservationEntity,
  ResultFeedGameKey,
  SourceEntity,
} from "@megawin/resultfeed/entities";
import type { DashboardStatsOutput } from "@megawin/resultfeed-application/use-cases/dashboard";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { type ConsensusListFilters, resultfeedKeys } from "@/lib/query-keys";

/** Shape trả về của `GET /api/resultfeed/consensus` — mirror `ListConsensusOutput`. */
export interface ConsensusListPage {
  data: ConsensusEntity[];
  nextCursor: string | null;
}

/**
 * List consensus theo `filters` (state/gameKey) + cursor — dùng cho `review` (filter
 * `state=conflict`) và card tra cứu trên dashboard.
 *
 * `keepPreviousData` giữ trang cũ trong lúc fetch trang mới — không nhấp nháy khi Next/Prev.
 */
export function useConsensusList(filters: ConsensusListFilters, cursor: string | null) {
  const params: Record<string, string> = {};
  if (filters.state) {
    params.state = filters.state;
  }
  if (filters.gameKey) {
    params.gameKey = filters.gameKey;
  }
  if (cursor) {
    params.cursor = cursor;
  }

  return useQuery({
    queryKey: resultfeedKeys.consensusList(filters, cursor),
    queryFn: () => apiClient.get<ConsensusListPage>("/resultfeed/consensus", { params }),
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
}

export interface ConsensusPeriodDetail {
  consensus: ConsensusEntity;
  observations: ObservationEntity[];
}

/** Chi tiết 1 kỳ (consensus + toàn bộ observations) — dùng chung `review` card và `periods`. */
export function useConsensusPeriod(gameKey: string | null, drawPeriod: string | null) {
  return useQuery({
    queryKey: resultfeedKeys.consensusPeriod(gameKey ?? "", drawPeriod ?? ""),
    queryFn: () =>
      apiClient.get<ConsensusPeriodDetail>(
        `/resultfeed/consensus/${encodeURIComponent(gameKey!)}/${encodeURIComponent(drawPeriod!)}`,
      ),
    enabled: !!gameKey && !!drawPeriod,
  });
}

export interface VerifyConsensusInput {
  chosenObservationId: string | null;
  manualNumbers?: string[];
  note?: string;
  confirmMismatch?: boolean;
}

/** Chốt kết quả 1 kỳ (verify) — invalidate list + detail sau khi thành công. */
export function useVerifyConsensus(gameKey: string, drawPeriod: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: VerifyConsensusInput) =>
      apiClient.post(
        `/resultfeed/consensus/${encodeURIComponent(gameKey)}/${encodeURIComponent(drawPeriod)}/verify`,
        input,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: resultfeedKeys.all });
      toast.success(`Đã xác nhận kết quả kỳ ${drawPeriod}.`);
    },
    onError: (err) => {
      const msg = err instanceof ApiClientError ? err.message : "Không thể xác nhận kết quả.";
      toast.error(msg);
    },
  });
}

/** Từ chối 1 kỳ (reject) — invalidate list + detail sau khi thành công. */
export function useRejectConsensus(gameKey: string, drawPeriod: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (note: string) =>
      apiClient.post(`/resultfeed/consensus/${encodeURIComponent(gameKey)}/${encodeURIComponent(drawPeriod)}/reject`, {
        note,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: resultfeedKeys.all });
      toast.success(`Đã từ chối kỳ ${drawPeriod}.`);
    },
    onError: (err) => {
      const msg = err instanceof ApiClientError ? err.message : "Không thể từ chối kỳ này.";
      toast.error(msg);
    },
  });
}

/** Observation gần đây theo game — card debug/tham khảo. */
export function useObservationsByGame(gameKey: ResultFeedGameKey | null, limit?: number) {
  return useQuery({
    queryKey: resultfeedKeys.observations(gameKey ?? "", limit),
    queryFn: () =>
      apiClient.get<ObservationEntity[]>("/resultfeed/observations", {
        params: { gameKey: gameKey!, ...(limit ? { limit: String(limit) } : {}) },
      }),
    enabled: !!gameKey,
  });
}

/** Danh sách toàn bộ nguồn thu thập — trang `sources`. */
export function useSources() {
  return useQuery({
    queryKey: resultfeedKeys.sources,
    queryFn: () => apiClient.get<SourceEntity[]>("/resultfeed/sources"),
    staleTime: 30_000,
  });
}

/** Body upsert 1 nguồn — mirror `updateSourceSchema` (route Zod). */
export type UpdateSourceInput = Omit<SourceEntity, "id" | "createdAt" | "updatedAt">;

/** Upsert 1 nguồn (role/trustWeight/isEnabled/...) — tự ghi audit log ở backend. */
export function useUpdateSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateSourceInput) => apiClient.post("/resultfeed/sources", input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: resultfeedKeys.sources });
      toast.success("Đã lưu cấu hình nguồn.");
    },
    onError: (err) => {
      const msg = err instanceof ApiClientError ? err.message : "Không thể lưu cấu hình nguồn.";
      toast.error(msg);
    },
  });
}

export interface AlertListOutput {
  items: AlertEntity[];
  countNew: number;
}

/** Hàng đợi alert theo status (mặc định `new`) — badge dashboard. */
export function useAlerts(status?: string) {
  return useQuery({
    queryKey: resultfeedKeys.alerts(status),
    queryFn: () => apiClient.get<AlertListOutput>("/resultfeed/alerts", { params: status ? { status } : {} }),
    staleTime: 15_000,
  });
}

/** Snapshot đếm consensus theo state/game + alert mới — trang dashboard. */
export function useDashboardStats() {
  return useQuery({
    queryKey: resultfeedKeys.dashboardStats,
    queryFn: () => apiClient.get<DashboardStatsOutput>("/resultfeed/dashboard"),
    staleTime: 15_000,
  });
}

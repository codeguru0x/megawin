"use client";

import { ApiClientError, apiClient } from "@megawin/next/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface GameConfig {
  id: string;
  scope: string;
  tenantId: null;
  jackpot: {
    seedAmount: number;
  };
  rates: {
    defaultCommissionRate: number;
    companyRate: number;
  };
  defaultPrizes: {
    tier1: number;
    tier2: number;
    tier3: number;
  };
  play: {
    unitPrice: number;
    minBetCount: number;
    maxBetCount: number;
    maxBoardsPerTicket: number;
    maxDrawCount: number;
    salesCloseBeforeMinutes: number;
    drawsPerWeek: number;
    drawDaysOfWeek: number[];
    drawTime: string;
  };
  /**
   * Vận hành & kiểm soát rủi ro. Server merge default nếu doc chưa có section này
   * (mapper normalize-on-read — analysis D1), nên FE luôn nhận đủ field.
   */
  ops: {
    alerts: {
      largeBetAmount: number;
      fixedExposureWarnAmount: number;
      comboAccountsWarn: number;
      baoHighStakeAmount: number;
      enabled: Record<string, boolean>;
    };
    stats: {
      tickSeconds: number;
      topPotentialK: number;
      topAccountsK: number;
      topCombosK: number;
    };
  };
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type { GameConfig };

const QUERY_KEY = ["mega645", "game-config"] as const;

export function useGameConfig() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => apiClient.get<GameConfig>("/mega645/config"),
  });
}

export function useUpdateGameConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient.put<{ config: GameConfig; version: number }>("/mega645/config", data),
    onSuccess: (res) => {
      queryClient.setQueryData(QUERY_KEY, res.config);
      toast.success(`Đã lưu cấu hình (v${res.version}).`);
    },
    onError: (err) => {
      toast.error(err instanceof ApiClientError ? err.message : "Lỗi khi cập nhật cấu hình.");
    },
  });
}

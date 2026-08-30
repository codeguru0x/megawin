"use client";

import type {
  FinancialRates,
  Max3dPrizeConfig,
  OpsConfig,
  PlayRules,
  VietlottPeriodAnchor,
} from "@megawin/game-max3d/entities";
import { ApiClientError, apiClient } from "@megawin/next/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface GameConfig {
  id: string;
  scope: string;
  tenantId: null;
  rates: FinancialRates;
  defaultPrizes: Max3dPrizeConfig;
  play: PlayRules;
  /** Cấu hình vận hành — doc cũ chưa save lần nào có thể thiếu (fallback default ở UI). */
  ops?: OpsConfig;
  /**
   * Neo suy mã kỳ Vietlott — `undefined` khi chưa cấu hình (chưa bật gợi ý).
   * Xem `.cursor/plans/vietlott-period-suggestion/00-overview.md`.
   */
  vietlott?: VietlottPeriodAnchor;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type { GameConfig };

const QUERY_KEY = ["max3d", "game-config"] as const;

export function useGameConfig() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => apiClient.get<GameConfig>("/max3d/config"),
  });
}

export function useUpdateGameConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient.put<{ config: GameConfig; version: number }>("/max3d/config", data),
    onSuccess: (res) => {
      queryClient.setQueryData(QUERY_KEY, res.config);
      toast.success(`Đã lưu cấu hình (v${res.version}).`);
    },
    onError: (err) => {
      toast.error(err instanceof ApiClientError ? err.message : "Lỗi khi cập nhật cấu hình.");
    },
  });
}

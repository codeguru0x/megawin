"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, ApiClientError } from "@megawin/next/client";
import { toast } from "sonner";
import type {
  Max3dPrizeConfig,
  FinancialRates,
  PlayRules,
} from "@megawin/game-max3d/entities/types";

interface GameConfig {
  id: string;
  scope: string;
  tenantId: null;
  rates: FinancialRates;
  defaultPrizes: Max3dPrizeConfig;
  play: PlayRules;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type { GameConfig };

const QUERY_KEY = ["max3d", "game-config"] as const;

export function useGameConfig() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () =>
      apiClient.get<{ config: GameConfig }>("/max3d/config").then((r) => r.config),
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
      toast.error(
        err instanceof ApiClientError ? err.message : "Lỗi khi cập nhật cấu hình.",
      );
    },
  });
}

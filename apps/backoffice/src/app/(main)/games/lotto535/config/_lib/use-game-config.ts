"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, ApiClientError } from "@megawin/next/client";
import { toast } from "sonner";

interface GameConfig {
  id: string;
  scope: string;
  tenantId: null;
  jackpot: {
    seedAmount: number;
    splitThreshold: number;
    splitRatios: { tier1: number; tier2: number; tier3: number; tier4: number; tier5: number };
  };
  rates: {
    defaultCommissionRate: number;
    companyRate: number;
  };
  defaultPrizes: {
    tier1: number;
    tier2: number;
    tier3: number;
    tier4: number;
    tier5: number;
    consolation: number;
  };
  play: {
    unitPrice: number;
    maxBoardsPerTicket: number;
    maxDrawCount: number;
    salesCloseBeforeMinutes: number;
    drawsPerDay: number;
    drawTimes: string[];
  };
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type { GameConfig };

const QUERY_KEY = ["lotto535", "game-config"] as const;

export function useGameConfig() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () =>
      apiClient.get<{ config: GameConfig }>("/lotto535/config").then((r) => r.config),
  });
}

export function useUpdateGameConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient.put<{ config: GameConfig; version: number }>("/lotto535/config", data),
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

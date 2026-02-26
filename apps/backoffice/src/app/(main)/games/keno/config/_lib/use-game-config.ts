"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, ApiClientError } from "@megawin/next/client";
import { toast } from "sonner";

import type {
  FinancialRates,
  BasicPrizes,
  BigSmallPrizes,
  EvenOddPrizes,
  PayoutCaps,
  PlayRules,
} from "@megawin/game-keno/entities";

export interface KenoGameConfig {
  id: string;
  scope: string;
  tenantId: null;
  rates: FinancialRates;
  basicPrizes: BasicPrizes;
  bigSmallPrizes: BigSmallPrizes;
  evenOddPrizes: EvenOddPrizes;
  payoutCaps: PayoutCaps;
  play: PlayRules;
  version: number;
  createdAt: string;
  updatedAt: string;
}

const QUERY_KEY = ["keno", "game-config"] as const;

export function useKenoGameConfig() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () =>
      apiClient
        .get<{ config: KenoGameConfig }>("/keno/config")
        .then((r) => r.config),
  });
}

export function useUpdateKenoGameConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient.put<{ config: KenoGameConfig; version: number }>(
        "/keno/config",
        data
      ),
    onSuccess: (res) => {
      queryClient.setQueryData(QUERY_KEY, res.config);
      toast.success(`Đã lưu cấu hình Keno (v${res.version}).`);
    },
    onError: (err) => {
      toast.error(
        err instanceof ApiClientError
          ? err.message
          : "Lỗi khi cập nhật cấu hình Keno."
      );
    },
  });
}

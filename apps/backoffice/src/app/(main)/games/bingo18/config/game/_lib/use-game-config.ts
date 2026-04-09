"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, ApiClientError } from "@megawin/next/client";
import { toast } from "sonner";
import { bingo18Keys } from "@/lib/query-keys";

import type {
  SingleNumPrizes,
  DoubleMatchPrizes,
  TripleMatchPrizes,
  SumTotalPrizes,
  BigSmallDrawPrizes,
  FinancialRates,
  PlayRules,
} from "@megawin/game-bingo18/entities";

export interface Bingo18GameConfig {
  version: number;
  updatedAt: string;
  singleNumPrizes: SingleNumPrizes;
  doubleMatchPrizes: DoubleMatchPrizes;
  tripleMatchPrizes: TripleMatchPrizes;
  sumTotalPrizes: SumTotalPrizes;
  bigSmallDrawPrizes: BigSmallDrawPrizes;
  rates: FinancialRates;
  play: PlayRules;
}

interface GetGameConfigOutput {
  config: Bingo18GameConfig;
}

interface UpdateGameConfigOutput {
  config: Bingo18GameConfig;
  version: number;
}

export function useBingo18GameConfig() {
  return useQuery({
    queryKey: bingo18Keys.config,
    queryFn: () =>
      apiClient
        .get<GetGameConfigOutput>("/bingo18/config")
        .then((r) => r.config),
  });
}

export function useUpdateBingo18GameConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient.put<UpdateGameConfigOutput>("/bingo18/config", data),
    onSuccess: (res) => {
      queryClient.setQueryData(bingo18Keys.config, res.config);
      toast.success(`Đã lưu cấu hình Bingo 18 (v${res.version}).`);
    },
    onError: (err) => {
      toast.error(
        err instanceof ApiClientError
          ? err.message
          : "Lỗi khi cập nhật cấu hình Bingo 18."
      );
    },
  });
}

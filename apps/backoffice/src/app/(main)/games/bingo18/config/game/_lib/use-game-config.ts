"use client";

import type {
  BigSmallDrawPrizes,
  DoubleMatchPrizes,
  FinancialRates,
  OpsConfig,
  PlayRules,
  SingleNumPrizes,
  SumTotalPrizes,
  TripleMatchPrizes,
} from "@megawin/game-bingo18/entities";
import { ApiClientError, apiClient } from "@megawin/next/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { bingo18Keys } from "@/lib/query-keys";

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
  /** Cấu hình vận hành — optional vì doc cũ chưa có section (fallback default ở OpsSection). */
  ops?: OpsConfig;
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
    queryFn: () => apiClient.get<GetGameConfigOutput>("/bingo18/config").then((r) => r.config),
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
        err instanceof ApiClientError ? err.message : "Lỗi khi cập nhật cấu hình Bingo 18.",
      );
    },
  });
}

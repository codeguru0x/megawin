"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, ApiClientError } from "@megawin/next/client";
import { toast } from "sonner";
import { kenoKeys } from "@/lib/query-keys";

import type {
  GlobalConfigEntity,
  GetGameConfigOutput,
  UpdateGameConfigOutput,
} from "@megawin/game-keno-application/use-cases/game-config";

export type KenoGameConfig = GlobalConfigEntity;

export function useKenoGameConfig() {
  return useQuery({
    queryKey: kenoKeys.config,
    queryFn: () =>
      apiClient.get<GetGameConfigOutput>("/keno/config").then((r) => r.config),
  });
}

export function useUpdateKenoGameConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient.put<UpdateGameConfigOutput>("/keno/config", data),
    onSuccess: (res) => {
      queryClient.setQueryData(kenoKeys.config, res.config);
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

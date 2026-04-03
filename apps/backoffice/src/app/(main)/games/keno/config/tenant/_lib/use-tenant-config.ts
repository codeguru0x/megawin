"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, ApiClientError } from "@megawin/next/client";
import { toast } from "sonner";
import { kenoKeys } from "@/lib/query-keys";

import type {
  TenantConfigEntity,
  ListTenantConfigsOutput,
  GetTenantConfigOutput,
  UpdateTenantConfigOutput,
} from "@megawin/game-keno-application/use-cases/tenant-config";

export type TenantConfig = TenantConfigEntity;

function detailKey(tenantId: string) {
  return [...kenoKeys.tenantConfigs, tenantId] as const;
}

export function useTenantConfigs() {
  return useQuery({
    queryKey: kenoKeys.tenantConfigs,
    queryFn: () =>
      apiClient
        .get<ListTenantConfigsOutput>("/keno/tenant-config")
        .then((r) => r.configs),
  });
}

export function useTenantConfig(tenantId: string | null) {
  return useQuery({
    queryKey: detailKey(tenantId ?? ""),
    queryFn: () =>
      apiClient
        .get<GetTenantConfigOutput>(`/keno/tenant-config/${tenantId}`)
        .then((r) => r.config),
    enabled: !!tenantId,
  });
}

export function useCreateTenantConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (tenantId: string) =>
      apiClient.put<UpdateTenantConfigOutput>(
        `/keno/tenant-config/${tenantId}`,
        { isEnabled: true }
      ),
    onSuccess: (res, tenantId) => {
      queryClient.setQueryData(detailKey(tenantId), res.config);
      queryClient.invalidateQueries({ queryKey: kenoKeys.tenantConfigs });
      toast.success(`Đã tạo cấu hình Keno cho đại lý "${tenantId}".`);
    },
    onError: (err) => {
      toast.error(
        err instanceof ApiClientError
          ? err.message
          : "Lỗi khi tạo cấu hình tenant."
      );
    },
  });
}

export function useUpdateTenantConfig(tenantId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient.put<UpdateTenantConfigOutput>(
        `/keno/tenant-config/${tenantId}`,
        data
      ),
    onSuccess: (res) => {
      queryClient.setQueryData(detailKey(tenantId), res.config);
      queryClient.invalidateQueries({ queryKey: kenoKeys.tenantConfigs });
      toast.success(
        `Đã lưu cấu hình Keno tenant "${tenantId}" (v${res.version}).`
      );
    },
    onError: (err) => {
      toast.error(
        err instanceof ApiClientError
          ? err.message
          : "Lỗi khi cập nhật cấu hình tenant."
      );
    },
  });
}

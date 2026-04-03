"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, ApiClientError } from "@megawin/next/client";
import { toast } from "sonner";
import { bingo18Keys } from "@/lib/query-keys";

export interface TenantConfig {
  id: string;
  tenantId: string;
  commissionRate: number;
  isEnabled: boolean;
  version: number;
  updatedAt: string;
}

interface ListTenantConfigsOutput {
  configs: TenantConfig[];
}

interface GetTenantConfigOutput {
  config: TenantConfig;
}

interface UpdateTenantConfigOutput {
  config: TenantConfig;
  version: number;
}

function detailKey(tenantId: string) {
  return [...bingo18Keys.tenantConfigs, tenantId] as const;
}

export function useTenantConfigs() {
  return useQuery({
    queryKey: bingo18Keys.tenantConfigs,
    queryFn: () =>
      apiClient
        .get<ListTenantConfigsOutput>("/bingo18/tenant-config")
        .then((r) => r.configs),
  });
}

export function useTenantConfig(tenantId: string | null) {
  return useQuery({
    queryKey: detailKey(tenantId ?? ""),
    queryFn: () =>
      apiClient
        .get<GetTenantConfigOutput>(`/bingo18/tenant-config/${tenantId}`)
        .then((r) => r.config),
    enabled: !!tenantId,
  });
}

export function useCreateTenantConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (tenantId: string) =>
      apiClient.put<UpdateTenantConfigOutput>(
        `/bingo18/tenant-config/${tenantId}`,
        { isEnabled: true }
      ),
    onSuccess: (res, tenantId) => {
      queryClient.setQueryData(detailKey(tenantId), res.config);
      queryClient.invalidateQueries({ queryKey: bingo18Keys.tenantConfigs });
      toast.success(`Đã tạo cấu hình Bingo 18 cho đại lý "${tenantId}".`);
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
        `/bingo18/tenant-config/${tenantId}`,
        data
      ),
    onSuccess: (res) => {
      queryClient.setQueryData(detailKey(tenantId), res.config);
      queryClient.invalidateQueries({ queryKey: bingo18Keys.tenantConfigs });
      toast.success(
        `Đã lưu cấu hình Bingo 18 tenant "${tenantId}" (v${res.version}).`
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

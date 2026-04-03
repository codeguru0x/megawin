"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, ApiClientError } from "@megawin/next/client";
import { toast } from "sonner";

interface TenantConfig {
  id: string;
  scope: string;
  tenantId: string;
  commissionRate: number;
  isEnabled: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type { TenantConfig };

const LIST_KEY = ["power655", "tenant-configs"] as const;

function detailKey(tenantId: string) {
  return ["power655", "tenant-config", tenantId] as const;
}

export function useTenantConfigs() {
  return useQuery({
    queryKey: LIST_KEY,
    queryFn: () =>
      apiClient
        .get<{ configs: TenantConfig[] }>("/power655/tenant-config")
        .then((r) => r.configs),
  });
}

export function useCreateTenantConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (tenantId: string) =>
      apiClient.put<{ config: TenantConfig; version: number }>(
        `/power655/tenant-config/${tenantId}`,
        { isEnabled: true },
      ),
    onSuccess: (res, tenantId) => {
      queryClient.setQueryData(detailKey(tenantId), res.config);
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      toast.success(`Đã tạo cấu hình cho đại lý "${tenantId}".`);
    },
    onError: (err) => {
      toast.error(
        err instanceof ApiClientError ? err.message : "Lỗi khi tạo cấu hình tenant.",
      );
    },
  });
}

export function useUpdateTenantConfig(tenantId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient.put<{ config: TenantConfig; version: number }>(
        `/power655/tenant-config/${tenantId}`,
        data,
      ),
    onSuccess: (res) => {
      queryClient.setQueryData(detailKey(tenantId), res.config);
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      toast.success(`Đã lưu cấu hình tenant "${tenantId}" (v${res.version}).`);
    },
    onError: (err) => {
      toast.error(
        err instanceof ApiClientError ? err.message : "Lỗi khi cập nhật cấu hình tenant.",
      );
    },
  });
}

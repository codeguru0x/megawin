"use client";

import { ApiClientError, apiClient } from "@megawin/next/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { tenantsKeys } from "@/lib/query-keys";

import type { Tenant } from "./schema";
import type {
  CreateTenantResponse,
  ListTenantsResponse,
  RegenerateApiKeyResponse,
  UpdateTenantResponse,
  UpdateTenantStatusResponse,
} from "./types";

export function useTenants() {
  return useQuery({
    queryKey: tenantsKeys.list,
    queryFn: () => apiClient.get<ListTenantsResponse>("/tenants"),
  });
}

interface CreateTenantInput {
  tenantId: string;
  displayName: string;
  description?: string;
  callbackBaseUrl: string;
}

export function useCreateTenant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (values: CreateTenantInput) => apiClient.post<CreateTenantResponse>("/tenants", values),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: tenantsKeys.all });
      toast.success(`Tạo tenant "${data.tenantId}" thành công.`);
    },
    onError: (error) => {
      toast.error(error instanceof ApiClientError ? error.message : "Đã xảy ra lỗi khi tạo tenant.");
    },
  });
}

interface UpdateTenantInput {
  tenantId: string;
  displayName?: string;
  description?: string;
  callbackBaseUrl?: string;
}

export function useUpdateTenant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (values: UpdateTenantInput) => apiClient.patch<UpdateTenantResponse>("/tenants", values),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: tenantsKeys.all });
      toast.success(`Đã cập nhật tenant "${variables.tenantId}".`);
    },
    onError: (error) => {
      toast.error(error instanceof ApiClientError ? error.message : "Đã xảy ra lỗi khi cập nhật.");
    },
  });
}

export function useToggleTenantStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ tenantId, status }: { tenantId: string; status: string }) =>
      apiClient.patch<UpdateTenantStatusResponse>("/tenants/status", {
        tenantId,
        status,
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: tenantsKeys.all });
      toast.success(`Đã ${data.status === "active" ? "kích hoạt" : "vô hiệu hóa"} tenant "${data.tenantId}".`);
    },
    onError: (error) => {
      toast.error(error instanceof ApiClientError ? error.message : "Không thể cập nhật trạng thái.");
    },
  });
}

export function useRegenerateApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (tenantId: string) =>
      apiClient.post<RegenerateApiKeyResponse>("/tenants/regenerate-key", {
        tenantId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tenantsKeys.all });
      toast.success("Đã tạo API key mới.");
    },
    onError: (error) => {
      toast.error(error instanceof ApiClientError ? error.message : "Không thể tạo API key mới.");
    },
  });
}

export type { Tenant };

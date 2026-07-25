"use client";

import { apiClient } from "@megawin/next/client";
import { useQuery } from "@tanstack/react-query";

import { tenantsKeys } from "@/lib/query-keys";

export interface TenantOption {
  tenantId: string;
  displayName: string;
  status: string;
}

interface TenantOptionsResponse {
  tenants: TenantOption[];
}

export function useTenantOptions() {
  return useQuery({
    queryKey: tenantsKeys.options,
    queryFn: () => apiClient.get<TenantOptionsResponse>("/tenants/options"),
    staleTime: 60_000,
  });
}

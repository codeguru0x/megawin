"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@megawin/next/client";

interface TenantOption {
  tenantId: string;
  displayName: string;
  status: string;
}

interface TenantOptionsResponse {
  tenants: TenantOption[];
}

export function useTenantOptions() {
  return useQuery({
    queryKey: ["tenants", "options"],
    queryFn: () => apiClient.get<TenantOptionsResponse>("/tenants/options"),
    staleTime: 60_000,
  });
}

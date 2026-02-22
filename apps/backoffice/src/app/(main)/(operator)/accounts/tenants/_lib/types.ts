import type { Tenant } from "./schema";

export interface ListTenantsResponse {
  tenants: Tenant[];
}

export interface CreateTenantResponse {
  tenantId: string;
  displayName: string;
  status: string;
  apiKey: string;
}

export interface UpdateTenantStatusResponse {
  tenantId: string;
  status: string;
}

export interface RegenerateApiKeyResponse {
  tenantId: string;
  apiKey: string;
}

export interface UpdateTenantResponse {
  tenantId: string;
  displayName: string;
}

export interface ListTenantOptionsResponse {
  tenants: {
    tenantId: string;
    displayName: string;
    status: string;
  }[];
}

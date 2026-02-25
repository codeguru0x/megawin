import type {
  TenantJwksAssertionConfig,
  TenantStatus,
} from "@megawin/identity/entities/tenant";

export interface CreateTenantInput {
  tenantId: string;
  displayName: string;
  description?: string;
  sso: Pick<TenantJwksAssertionConfig, "jwksUrl">;
  callbackBaseUrl: string;
}

export interface CreateTenantOutput {
  tenantId: string;
  displayName: string;
  status: string;
  apiKey: string;
}

export interface ListTenantsOutput {
  tenants: {
    id: string;
    tenantId: string;
    displayName: string;
    description?: string;
    status: string;
    apiKey: string;
    sso: TenantJwksAssertionConfig;
    callbackBaseUrl: string;
    apiKeyLastRotatedAt: string;
    createdAt: string;
    updatedAt: string;
  }[];
}

export interface UpdateTenantStatusInput {
  tenantId: string;
  status: TenantStatus;
}

export interface UpdateTenantStatusOutput {
  tenantId: string;
  status: string;
}

export interface RegenerateApiKeyInput {
  tenantId: string;
}

export interface RegenerateApiKeyOutput {
  tenantId: string;
  apiKey: string;
}

export interface UpdateTenantInput {
  tenantId: string;
  displayName?: string;
  description?: string;
  jwksUrl?: string;
  callbackBaseUrl?: string;
}

export interface UpdateTenantOutput {
  tenantId: string;
  displayName: string;
}

export interface ListTenantOptionsOutput {
  tenants: {
    tenantId: string;
    displayName: string;
    status: string;
  }[];
}

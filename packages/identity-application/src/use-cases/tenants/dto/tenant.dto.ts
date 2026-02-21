import type {
  TenantJwksAssertionConfig,
  TenantApp,
  TenantStatus,
} from "@megawin/identity-domain/tenants/tenant";

export interface CreateTenantInput {
  tenantId: string;
  displayName: string;
  description?: string;
  sso: Pick<TenantJwksAssertionConfig, "jwksUrl">;
  app: TenantApp;
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
    app: TenantApp;
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
  allowedOrigins?: string[];
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

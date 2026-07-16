import type { TenantEntity } from "@megawin/identity/entities";

/** Callback config tối thiểu để build TenantGatewayClient — subset của TenantEntity. */
export type TenantCallbackConfig = Pick<TenantEntity, "tenantId" | "callbackBaseUrl" | "apiKey">;

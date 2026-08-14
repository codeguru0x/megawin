/**
 * withTenantAuth — wrap handler với Tenant API key auth.
 *
 * Dùng chung `buildHandler()` + type `WithSchema` với các wrapper JWT (`withPlayerAuth`…) —
 * chỉ khác auth middleware (API key thay vì Cognito JWT).
 *
 * @example
 * import { withTenantAuth } from "@megawin/auth/tenant";
 *
 * export const handler = withTenantAuth(async (event) => {
 *   event.tenant.tenantId;
 *   event.schema.query.limit;
 * }, { schemas: { query: querySchema } });
 */

import { buildHandler, type WithSchema } from "../handler-wrappers";
import type { ApiGatewayEventWithTenant, ApiGatewayZodSchemas } from "../index";
import { tenantAuth } from "./tenant-auth";

export function withTenantAuth<TSchemas extends ApiGatewayZodSchemas | undefined = undefined>(
  fn: (event: WithSchema<ApiGatewayEventWithTenant, TSchemas>) => Promise<unknown>,
  options?: {
    schemas?: TSchemas;
    allowedStatuses?: string[];
  },
) {
  const middleware = tenantAuth(options?.allowedStatuses ? { allowedStatuses: options.allowedStatuses } : undefined);
  return buildHandler(fn, options?.schemas, middleware);
}

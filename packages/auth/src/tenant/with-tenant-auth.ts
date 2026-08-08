/**
 * withTenantAuth — wrap handler với Tenant API key auth.
 *
 * @example
 * import { withTenantAuth } from "@megawin/auth/tenant";
 *
 * export const handler = withTenantAuth(async (event) => {
 *   event.tenant.tenantId;
 *   event.schema.query.limit;
 * }, { schemas: { query: querySchema } });
 */

import { type ApiGatewayEventWithTenant, type ApiGatewayZodSchemas, type InferSchema } from "../index";
import { withMiddleware } from "../handler-wrappers";
import { tenantAuth } from "./tenant-auth";

export function withTenantAuth<TSchemas extends ApiGatewayZodSchemas | undefined = undefined>(
  fn: (
    event: ApiGatewayEventWithTenant & (TSchemas extends undefined ? unknown : { schema: InferSchema<TSchemas> }),
  ) => Promise<unknown>,
  options?: {
    schemas?: TSchemas;
    allowedStatuses?: string[];
  },
) {
  const middleware = tenantAuth(options?.allowedStatuses ? { allowedStatuses: options.allowedStatuses } : undefined);
  return withMiddleware(fn, middleware, { schemas: options?.schemas });
}

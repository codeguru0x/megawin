/**
 * @megawin/auth — Authentication & Authorization cho API Gateway Lambda.
 *
 * === User auth (Cognito JWT) ===
 * import { playerAuth, agentAuth, companyAuth } from "@megawin/auth";
 * import { withPlayerAuth, withAgentAuth, withCompanyAuth } from "@megawin/auth";
 *
 * === Tenant API key auth ===
 * import { tenantApiKeyAuthMiddleware } from "@megawin/auth";
 * import { withTenantAuth } from "@megawin/auth/tenant";
 */

/** Authorization core */
export {
  getAuthContextFromApiGatewayEvent,
  checkAuthorization,
  type AuthContext,
  type AuthRequirements,
  type AuthContextAdapterOptions,
  type ApiGatewayEventWithAuthorizer,
} from "./authorization-api-gateway";

/** Authorization middleware — account type specific */
export {
  playerAuth,
  agentAuth,
  companyAuth,
  authorizationMiddleware,
  type UserAuthOptions,
  type CompanyAuthOptions,
  type ApiGatewayEventWithUser,
} from "./authorization-middleware";

/** Handler wrappers — all-in-one (auth + validator + error handler) */
export {
  withPlayerAuth,
  withAgentAuth,
  withCompanyAuth,
  withMiddleware,
  type InferSchema,
} from "./handler-wrappers";

/** Re-export from app-core for consumer convenience */
export {
  validatorZodMiddleware,
  httpErrorHandlerUseCaseFormat,
  type ApiGatewayZodSchemas,
  type SchemaOf,
} from "@megawin/app-core/lambda/middleware";

/** Tenant API Key auth (server-to-server) — generic middleware */
export {
  tenantApiKeyAuthMiddleware,
  type TenantApiKeyAuthOptions,
  type TenantContext,
  type ApiGatewayEventWithTenant,
} from "./tenant-api-key-auth";

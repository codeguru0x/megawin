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

/** Re-export from app-core for consumer convenience */
export {
  type ApiGatewayZodSchemas,
  httpErrorHandlerUseCaseFormat,
  type SchemaOf,
  validatorZodMiddleware,
} from "@megawin/app-core/lambda/middleware";

/** Authorization core */
export {
  type ApiGatewayEventWithAuthorizer,
  type AuthContext,
  type AuthContextAdapterOptions,
  type AuthRequirements,
  type CompanyAuthContext,
  checkAuthorization,
  getAuthContextFromApiGatewayEvent,
  type TenantAuthContext,
} from "./authorization-api-gateway";
/** Authorization middleware — account type specific */
export {
  agentAuth,
  authorizationMiddleware,
  type CompanyAuthOptions,
  type CompanyUserEvent,
  companyAuth,
  playerAuth,
  type TenantUserEvent,
  type UserAuthOptions,
} from "./authorization-middleware";
/** Handler wrappers — all-in-one (auth + validator + success envelope + error handler) */
export {
  buildHandler,
  type InferSchema,
  type WithSchema,
  withAgentAuth,
  withCompanyAuth,
  withPlayerAuth,
  withPublicHandler,
} from "./handler-wrappers";
/** Tenant API Key auth (server-to-server) — generic middleware */
export {
  type ApiGatewayEventWithTenant,
  type TenantApiKeyAuthOptions,
  type TenantContext,
  tenantApiKeyAuthMiddleware,
} from "./tenant-api-key-auth";

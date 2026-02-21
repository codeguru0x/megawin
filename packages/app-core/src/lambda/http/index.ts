/**
 * Lambda HTTP helpers – authorization context & check.
 * Dùng bởi middleware (authorizationMiddleware) để check quyền.
 */

export {
  getAuthContextFromApiGatewayEvent,
  checkAuthorization,
  type AuthContext,
  type AuthRequirements,
  type AuthContextAdapterOptions,
  type ApiGatewayEventWithAuthorizer,
} from "./authorization-api-gateway";

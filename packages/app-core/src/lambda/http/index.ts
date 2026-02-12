/**
 * Lambda HTTP helpers – authorization context & check.
 * Dùng bởi middleware (authorizationMiddleware) để check quyền.
 *
 * import {
 *   getAuthContextFromApiGatewayEvent,
 *   checkAuthorization,
 * } from "@megawin/app-core/lambda/http";
 */

export {
  getAuthContextFromApiGatewayEvent,
  checkAuthorization,
  type AuthContext,
  type AuthRequirements,
  type AuthScope,
  type AuthContextAdapterOptions,
  type ApiGatewayEventWithAuthorizer,
} from "./authorization-api-gateway";

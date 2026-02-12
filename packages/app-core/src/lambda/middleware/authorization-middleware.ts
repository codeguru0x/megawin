/**
 * Middy middleware: check authorization trước khi handler/use case chạy.
 * Dùng sau Cognito / Lambda Authorizer – không verify token, chỉ check:
 * public/authed, scope (internal | player | agent), roles.
 * Thất bại → 403 (hoặc 401 nếu thiếu auth) và short-circuit.
 *
 * Thứ tự chuẩn: Authorizer (Cognito) → authorizationMiddleware → validatorZodMiddleware → handler (use case).
 */

import { appErrorToStatusCode } from "@megawin/shared/errors";
import {
  getAuthContextFromApiGatewayEvent,
  checkAuthorization,
  type AuthRequirements,
  type AuthContextAdapterOptions,
  type ApiGatewayEventWithAuthorizer,
} from "../http/authorization-api-gateway";

const JSON_HEADERS = { "Content-Type": "application/json" };

/**
 * Middleware: đọc auth từ requestContext.authorizer, check requirements.
 * Nếu pass: gán request.event.authContext (để handler/use case dùng nếu cần).
 * Nếu fail: set request.earlyResponse = 401/403.
 *
 * @param requirements - public/authed, scope?, roles?
 * @param adapterOptions - map claims → AuthContext (tenantId, roles, isInternal)
 */
export function authorizationMiddleware(
  requirements: AuthRequirements,
  adapterOptions?: AuthContextAdapterOptions
) {
  return {
    before: async (request: {
      event: ApiGatewayEventWithAuthorizer & { authContext?: unknown };
      earlyResponse?: unknown;
    }) => {
      const event = request.event;
      const auth = getAuthContextFromApiGatewayEvent(event, adapterOptions);
      const error = checkAuthorization(auth, requirements);
      if (error) {
        const statusCode = appErrorToStatusCode(error);
        request.earlyResponse = {
          statusCode,
          headers: JSON_HEADERS,
          body: JSON.stringify({
            error: {
              code: error.code,
              message: error.message,
              ...(error.details !== undefined && { details: error.details }),
            },
          }),
        };
        return;
      }
      (
        event as ApiGatewayEventWithAuthorizer & { authContext?: unknown }
      ).authContext = auth ?? null;
    },
  };
}

/**
 * Type helper: event đã qua authorizationMiddleware có authContext.
 */
export interface ApiGatewayEventWithAuthContext {
  authContext?: unknown;
}

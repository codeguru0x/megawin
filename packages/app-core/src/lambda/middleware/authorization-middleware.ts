/**
 * Middy middleware: check authorization trước khi handler/use case chạy.
 * Gọi middleware = bắt buộc authed. Không gọi = public route.
 * SUPER_ROLES (Admin) tự động bypass role check.
 *
 * Thứ tự chuẩn: Authorizer (Cognito) → authorizationMiddleware → validatorZodMiddleware → handler.
 */

import { appErrorToStatusCode } from "@megawin/shared/errors";
import type { ApiErrorResponse } from "@megawin/shared/api-types";
import {
  getAuthContextFromApiGatewayEvent,
  checkAuthorization,
  type AuthRequirements,
  type AuthContextAdapterOptions,
  type ApiGatewayEventWithAuthorizer,
  type AuthContext,
} from "../http/authorization-api-gateway";

const JSON_HEADERS = { "Content-Type": "application/json" };

/**
 * Middleware: đọc auth từ requestContext.authorizer, check requirements.
 * Nếu pass: gán event.authContext.
 * Nếu fail: set earlyResponse 401/403 (unified format).
 */
export function authorizationMiddleware(
  requirements: AuthRequirements,
  adapterOptions?: AuthContextAdapterOptions,
) {
  return {
    before: async (request: {
      event: ApiGatewayEventWithAuthorizer & {
        authContext?: AuthContext | null;
        httpMethod?: string;
        requestContext?: { httpMethod?: string; [key: string]: unknown };
      };
      earlyResponse?: unknown;
    }) => {
      const event = request.event;
      const auth = getAuthContextFromApiGatewayEvent(event, adapterOptions);
      const httpMethod =
        event.httpMethod ?? event.requestContext?.httpMethod ?? undefined;
      const error = checkAuthorization(auth, requirements, httpMethod);
      if (error) {
        const statusCode = appErrorToStatusCode(error);
        const body: ApiErrorResponse = {
          success: false,
          error: {
            code: error.code,
            message: error.message,
            ...(error.details !== undefined && { details: error.details }),
          },
        };
        request.earlyResponse = {
          statusCode,
          headers: JSON_HEADERS,
          body: JSON.stringify(body),
        };
        return;
      }
      event.authContext = auth ?? null;
    },
  };
}

/**
 * Type helper: event đã qua authorizationMiddleware có authContext.
 */
export interface ApiGatewayEventWithAuthContext {
  authContext: AuthContext | null;
}

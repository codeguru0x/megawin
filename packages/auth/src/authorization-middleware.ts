/**
 * Middy middleware: Authorization dựa trên Cognito ID token.
 *
 * Cognito Authorizer đã verify JWT. Middleware này chỉ check:
 * - accountType (company | agent | player)
 * - roles (admin bypass qua SUPER_ROLES)
 * - accountStatus (suspended / read_only enforcement)
 *
 * 3 convenience middleware:
 * - playerAuth()  → chỉ Player
 * - agentAuth()   → chỉ Agent
 * - companyAuth() → chỉ Company (admin | staff)
 *
 * Sau khi verify → gán event.user (AuthContext).
 */

import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda/trigger/api-gateway-proxy";
import { appErrorToStatusCode } from "@megawin/shared/errors";
import type { ApiErrorResponse } from "@megawin/shared/api-types";
import {
  getAuthContextFromApiGatewayEvent,
  checkAuthorization,
  type AuthRequirements,
  type AuthContextAdapterOptions,
  type ApiGatewayEventWithAuthorizer,
  type AuthContext,
  type TenantAuthContext,
  type CompanyAuthContext,
} from "./authorization-api-gateway";
import {
  AccountType,
  CompanyRole,
  AgentRole,
  PlayerRole,
  type CompanyRole as CompanyRoleType,
} from "@megawin/identity/entities/account";

export type { AuthContext, TenantAuthContext, CompanyAuthContext };

const JSON_HEADERS = { "Content-Type": "application/json" };

// ============ Types ============

export interface UserAuthOptions {
  roles?: AuthRequirements["roles"];
  adapterOptions?: AuthContextAdapterOptions;
}

/**
 * Event gốc HTTP API v2 + augmented `user` field từ auth middleware.
 * Giữ nguyên tất cả properties của API Gateway event (headers, requestContext, body, etc.)
 * để handler có thể truy cập trực tiếp, ví dụ: `event.requestContext.http.sourceIp`.
 */
export interface TenantUserEvent extends APIGatewayProxyEventV2WithJWTAuthorizer {
  user: TenantAuthContext;
}

/**
 * Event gốc HTTP API v2 + augmented `user` field cho company handlers.
 * Giữ nguyên tất cả properties của API Gateway event.
 */
export interface CompanyUserEvent extends APIGatewayProxyEventV2WithJWTAuthorizer {
  user: CompanyAuthContext;
}

// ============ Base authorization middleware ============

function buildAuthMiddleware(
  baseRequirements: AuthRequirements,
  extraRoles?: AuthRequirements["roles"],
  adapterOptions?: AuthContextAdapterOptions,
) {
  const requirements: AuthRequirements = {
    ...baseRequirements,
    ...(extraRoles && extraRoles.length > 0 && { roles: extraRoles }),
  };

  return {
    before: async (request: {
      event: ApiGatewayEventWithAuthorizer & {
        user?: AuthContext | null;
        httpMethod?: string;
        requestContext?: { httpMethod?: string; [key: string]: unknown };
      };
      earlyResponse?: unknown;
    }) => {
      const event = request.event;
      const auth = getAuthContextFromApiGatewayEvent(event, adapterOptions);
      const httpMethod = event.httpMethod ?? event.requestContext?.httpMethod ?? undefined;
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

      event.user = auth!;
    },
  };
}

// ============ Player auth ============

export function playerAuth(options?: UserAuthOptions) {
  return buildAuthMiddleware(
    {
      accountType: AccountType.Player,
      roles: [PlayerRole.Player],
    },
    options?.roles,
    options?.adapterOptions,
  );
}

// ============ Agent auth ============

export function agentAuth(options?: UserAuthOptions) {
  return buildAuthMiddleware(
    { accountType: AccountType.Agent, roles: [AgentRole.Agent] },
    options?.roles,
    options?.adapterOptions,
  );
}

// ============ Company auth ============

export interface CompanyAuthOptions extends UserAuthOptions {
  roles?: CompanyRoleType[];
}

export function companyAuth(options?: CompanyAuthOptions) {
  return buildAuthMiddleware(
    {
      accountType: AccountType.Company,
      roles: [CompanyRole.Admin, CompanyRole.Staff],
    },
    options?.roles,
    options?.adapterOptions,
  );
}

// ============ Generic auth ============

/** @deprecated Ưu tiên dùng playerAuth(), agentAuth(), companyAuth() */
export function authorizationMiddleware(
  requirements: AuthRequirements,
  adapterOptions?: AuthContextAdapterOptions,
) {
  return buildAuthMiddleware(requirements, undefined, adapterOptions);
}

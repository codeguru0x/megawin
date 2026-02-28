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

/** Event cho player / agent handlers — tenantId luôn có. */
export interface TenantUserEvent {
  user: TenantAuthContext;
}

/** Event cho company handlers — không có tenantId. */
export interface CompanyUserEvent {
  user: CompanyAuthContext;
}

/** @deprecated Dùng TenantUserEvent hoặc CompanyUserEvent thay thế. */
export interface ApiGatewayEventWithUser {
  user: AuthContext;
}

// ============ Base authorization middleware ============

function buildAuthMiddleware(
  baseRequirements: AuthRequirements,
  extraRoles?: AuthRequirements["roles"],
  adapterOptions?: AuthContextAdapterOptions
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
    options?.adapterOptions
  );
}

// ============ Agent auth ============

export function agentAuth(options?: UserAuthOptions) {
  return buildAuthMiddleware(
    { accountType: AccountType.Agent, roles: [AgentRole.Agent] },
    options?.roles,
    options?.adapterOptions
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
    options?.adapterOptions
  );
}

// ============ Generic auth ============

/** @deprecated Ưu tiên dùng playerAuth(), agentAuth(), companyAuth() */
export function authorizationMiddleware(
  requirements: AuthRequirements,
  adapterOptions?: AuthContextAdapterOptions
) {
  return buildAuthMiddleware(requirements, undefined, adapterOptions);
}

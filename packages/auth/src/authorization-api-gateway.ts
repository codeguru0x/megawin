/**
 * Authorization cho API Gateway (sau Cognito / Lambda Authorizer).
 * Không verify token – Authorizer đã verify. Ở đây chỉ check:
 * - accountType: company | agent | player (từ domain AccountType)
 * - roles: danh sách role cho phép (admin tự động bypass qua SUPER_ROLES)
 *
 * Gọi middleware = bắt buộc authed. Không gọi = public.
 */

import { APP_ERROR_CODES, type AppError } from "@megawin/shared/errors";
import {
  type AccountType,
  type AccountStatus,
  AccountStatus as AccountStatusEnum,
  type AccountRole,
  SUPER_ROLES,
} from "@megawin/identity-domain/accounts/account";
import { ClaimKey } from "@megawin/identity-domain/cognito/claim";

// ============ Auth context (sau Authorizer) ============

export interface AuthContext {
  sub: string;
  username?: string;
  accountType: AccountType;
  accountStatus: AccountStatus;
  accountId?: string;
  tenantId?: string;
  roles: string[];
  raw?: Record<string, unknown>;
}

// ============ Auth requirements ============

export interface AuthRequirements {
  accountType?: AccountType | AccountType[];
  roles?: AccountRole[];
  enforceStatusByMethod?: boolean;
}

// ============ Adapter: event → AuthContext ============

export interface ApiGatewayEventWithAuthorizer {
  requestContext?: {
    authorizer?: {
      claims?: Record<string, unknown>;
      sub?: string;
      principalId?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
}

export interface AuthContextAdapterOptions {
  tenantIdClaim?: string;
  rolesClaim?: string;
  accountTypeClaim?: string;
  usernameClaim?: string;
  accountStatusClaim?: string;
  accountIdClaim?: string;
}

const DEFAULT_ADAPTER_OPTIONS = {
  rolesClaim: ClaimKey.Roles,
  usernameClaim: ClaimKey.Username,
  accountTypeClaim: ClaimKey.AccountType,
  accountStatusClaim: ClaimKey.AccountStatus,
  accountIdClaim: ClaimKey.AccountId,
  tenantIdClaim: ClaimKey.TenantId,
} as const;

function parseRoles(value: unknown): string[] {
  if (Array.isArray(value))
    return value.filter((v): v is string => typeof v === "string");
  if (typeof value === "string")
    return value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  return [];
}

export function getAuthContextFromApiGatewayEvent(
  event: ApiGatewayEventWithAuthorizer,
  options: AuthContextAdapterOptions = {},
): AuthContext | null {
  const opts = { ...DEFAULT_ADAPTER_OPTIONS, ...options };
  const authorizer = event.requestContext?.authorizer;
  if (!authorizer) return null;

  const claims = (authorizer.claims ?? authorizer) as Record<string, unknown>;
  const sub =
    (claims[ClaimKey.Sub] as string) ??
    (authorizer.sub as string) ??
    (authorizer.principalId as string);
  if (!sub || typeof sub !== "string") return null;

  const username = (claims[opts.usernameClaim] as string) ?? undefined;
  const tenantId = (claims[opts.tenantIdClaim] as string) ?? undefined;
  const roles = parseRoles(claims[opts.rolesClaim]);
  const accountType = (claims[opts.accountTypeClaim] as AccountType) ?? "player";
  const accountId = (claims[opts.accountIdClaim] as string) ?? undefined;
  const accountStatus =
    (claims[opts.accountStatusClaim] as AccountStatus) ??
    AccountStatusEnum.Active;

  return {
    sub,
    username,
    accountType,
    accountStatus,
    accountId,
    tenantId,
    roles,
    raw: claims as Record<string, unknown>,
  };
}

// ============ Read-only HTTP methods ============

const READ_ONLY_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// ============ Check authorization ============

export function checkAuthorization(
  authContext: AuthContext | null,
  requirements: AuthRequirements,
  httpMethod?: string,
): void | AppError {
  if (!authContext) {
    return {
      code: APP_ERROR_CODES.UNAUTHORIZED,
      message: "Authentication required",
    };
  }

  if (authContext.accountStatus === AccountStatusEnum.Suspended) {
    return {
      code: APP_ERROR_CODES.ACCOUNT_SUSPENDED,
      message: "Account is suspended",
    };
  }

  const enforceStatus = requirements.enforceStatusByMethod !== false;
  if (enforceStatus && httpMethod) {
    const isReadOnly = READ_ONLY_METHODS.has(httpMethod.toUpperCase());
    if (
      !isReadOnly &&
      authContext.accountStatus === AccountStatusEnum.ReadOnly
    ) {
      return {
        code: APP_ERROR_CODES.ACCOUNT_READ_ONLY,
        message: "Account is read-only, mutation operations are not allowed",
      };
    }
  }

  const { accountType, roles: allowedRoles } = requirements;

  if (accountType !== undefined) {
    const allowed = Array.isArray(accountType) ? accountType : [accountType];
    if (!allowed.includes(authContext.accountType)) {
      return {
        code: APP_ERROR_CODES.FORBIDDEN,
        message: "Account type not permitted",
        details: { required: allowed, actual: authContext.accountType },
      };
    }
  }

  if (allowedRoles != null && allowedRoles.length > 0) {
    const hasSuperRole = SUPER_ROLES.some((r: string) =>
      authContext.roles.includes(r),
    );
    if (!hasSuperRole) {
      const hasRole = allowedRoles.some((r: string) => authContext.roles.includes(r));
      if (!hasRole) {
        return {
          code: APP_ERROR_CODES.FORBIDDEN,
          message: "Insufficient permissions",
          details: { requiredRoles: allowedRoles },
        };
      }
    }
  }

  return undefined;
}

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
  /** User id (sub từ JWT). */
  sub: string;
  /** Username (cognito:username). */
  username?: string;
  /** Account type từ domain (company / agent / player). */
  accountType: AccountType;
  /** Account status (active / read_only / suspended). */
  accountStatus: AccountStatus;
  /** Account id (custom:account_id). */
  accountId?: string;
  /** Tenant id nếu user thuộc tenant (player/agent). */
  tenantId?: string;
  /** Roles từ cognito:groups hoặc custom claim. */
  roles: string[];
  /** Claims gốc để check tùy biến. */
  raw?: Record<string, unknown>;
}

// ============ Auth requirements ============

/**
 * Yêu cầu authorization cho một use case / route.
 * Gọi middleware = bắt buộc authed. Không cần `access` field.
 */
export interface AuthRequirements {
  /**
   * Account type cho phép. Nếu set: user phải có accountType tương ứng.
   * Cho phép single value hoặc array (OR logic).
   * Nếu không set: bất kỳ authed user nào đều OK.
   */
  accountType?: AccountType | AccountType[];

  /**
   * Roles cho phép. Nếu set: user phải có ít nhất 1 role trong danh sách.
   * SUPER_ROLES (Admin) tự động bypass check này.
   */
  roles?: AccountRole[];

  /**
   * Nếu true, enforce status check theo HTTP method:
   * - GET/HEAD/OPTIONS → cho phép Active + ReadOnly
   * - POST/PUT/PATCH/DELETE → chỉ cho phép Active
   * Mặc định: true khi gọi middleware.
   */
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

/**
 * Cấu hình map từ authorizer claims sang AuthContext.
 * Mặc định dùng ClaimKey từ identity-domain.
 */
export interface AuthContextAdapterOptions {
  /** Claim key cho tenant id. Mặc định: ClaimKey.TenantId */
  tenantIdClaim?: string;
  /** Claim key cho roles. Mặc định: ClaimKey.Roles */
  rolesClaim?: string;
  /** Claim key cho account type. Mặc định: ClaimKey.AccountType */
  accountTypeClaim?: string;
  /** Claim key cho username. Mặc định: ClaimKey.Username */
  usernameClaim?: string;
  /** Claim key cho account status. Mặc định: ClaimKey.AccountStatus */
  accountStatusClaim?: string;
  /** Claim key cho account id. Mặc định: ClaimKey.AccountId */
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

/**
 * Lấy AuthContext từ event API Gateway (sau Cognito / Lambda Authorizer).
 * Trả null nếu không có authorizer hoặc không đủ thông tin.
 */
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

/**
 * Kiểm tra auth context có thỏa requirements không.
 *
 * Pipeline:
 * 1. Không có authContext → 401
 * 2. accountStatus === suspended → 403 (ACCOUNT_SUSPENDED)
 * 3. enforceStatusByMethod: mutation + read_only → 403 (ACCOUNT_READ_ONLY)
 * 4. accountType set → check match → 403
 * 5. roles set → check SUPER_ROLES bypass → check role match → 403
 */
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

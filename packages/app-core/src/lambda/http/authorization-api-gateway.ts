/**
 * Authorization cho API Gateway (sau Cognito / Lambda Authorizer).
 * Không verify token – Authorizer đã verify. Ở đây chỉ check:
 * - public vs authed (có đăng nhập hay không)
 * - scope: internal (công ty) | player (có tenant) | agent (internal + tenant)
 * - roles: danh sách role cho phép (vd từ cognito:groups)
 */

import {
  USE_CASE_ERROR_CODES,
  type UseCaseError,
} from "#application/usecase/usecase-base";

// ============ Auth context (sau Authorizer) ============

/**
 * Context auth đã được Authorizer (Cognito/Lambda) verify.
 * Dùng để check authorization trước khi validate + run use case.
 */
export interface AuthContext {
  /** User id (vd sub từ JWT). */
  sub: string;
  /** Username (vd cognito:username). */
  username?: string;
  /** Tenant id nếu user thuộc tenant (player/agent). */
  tenantId?: string;
  /** Là tài khoản nội bộ (công ty). */
  isInternal: boolean;
  /** Roles từ cognito:groups hoặc custom claim. */
  roles: string[];
  /** Claims gốc để check tùy biến. */
  raw?: Record<string, unknown>;
}

// ============ Auth requirements (per use case / route) ============

/** Phạm vi tài khoản: internal = công ty, player = có tenant, agent = internal + tenant. */
export type AuthScope = "internal" | "player" | "agent";

/**
 * Yêu cầu authorization cho một use case / route.
 * Check theo thứ tự: access → scope → roles.
 */
export interface AuthRequirements {
  /**
   * public: không cần đăng nhập (authorizer có thể không chạy).
   * authed: bắt buộc đã đăng nhập (có auth context).
   */
  access: "public" | "authed";

  /**
   * Nếu set: user phải thuộc scope tương ứng.
   * - internal: chỉ tài khoản công ty (isInternal === true).
   * - player: có tenant (tenantId có giá trị), thường end-user.
   * - agent: internal + có tenant (support agent trong tenant).
   */
  scope?: AuthScope;

  /**
   * Nếu set: user phải có ít nhất một role trong danh sách.
   * Thường map từ cognito:groups.
   */
  roles?: string[];
}

// ============ Adapter: event → AuthContext ============

/** Event API Gateway có requestContext (sau Authorizer). */
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
 * Cognito: claims trong requestContext.authorizer.claims;
 * Custom Lambda authorizer: có thể dùng requestContext.authorizer.* trực tiếp.
 */
export interface AuthContextAdapterOptions {
  /**
   * Claim key cho tenant id (vd "custom:tenantId" hoặc "tenantId").
   */
  tenantIdClaim?: string;
  /**
   * Claim key cho roles (vd "cognito:groups"). Giá trị có thể string (comma-separated) hoặc string[].
   */
  rolesClaim?: string;
  /**
   * Group name hoặc claim key/giá trị để coi là internal.
   * Nếu string: so sánh với 1 phần tử trong roles (vd "Internal").
   * Hoặc dùng custom claim: { claim: "custom:isInternal", value: "true" }.
   */
  internalIndicator?: string | { claim: string; value: string | boolean };
  /**
   * Claim cho username (mặc định "cognito:username").
   */
  usernameClaim?: string;
}

const DEFAULT_ADAPTER_OPTIONS: Required<
  Pick<AuthContextAdapterOptions, "rolesClaim" | "usernameClaim">
> &
  Pick<AuthContextAdapterOptions, "tenantIdClaim" | "internalIndicator"> = {
  rolesClaim: "cognito:groups",
  usernameClaim: "cognito:username",
};

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
 * Nếu không có authorizer hoặc không đủ thông tin → trả về null (request public hoặc chưa auth).
 */
export function getAuthContextFromApiGatewayEvent(
  event: ApiGatewayEventWithAuthorizer,
  options: AuthContextAdapterOptions = {}
): AuthContext | null {
  const opts = { ...DEFAULT_ADAPTER_OPTIONS, ...options };
  const authorizer = event.requestContext?.authorizer;
  if (!authorizer) return null;

  const claims = (authorizer.claims ?? authorizer) as Record<string, unknown>;
  const sub =
    (claims.sub as string) ??
    (authorizer.sub as string) ??
    (authorizer.principalId as string);
  if (!sub || typeof sub !== "string") return null;

  const username = (claims[opts.usernameClaim] as string) ?? undefined;
  const tenantId = opts.tenantIdClaim
    ? ((claims[opts.tenantIdClaim] as string) ?? undefined)
    : undefined;
  const roles = parseRoles(claims[opts.rolesClaim]);

  let isInternal = false;
  if (opts.internalIndicator !== undefined) {
    if (typeof opts.internalIndicator === "string") {
      isInternal = roles.some((r) => r === opts.internalIndicator);
    } else {
      const val = claims[opts.internalIndicator.claim];
      isInternal =
        val === opts.internalIndicator.value ||
        (typeof opts.internalIndicator.value === "boolean" &&
          val === String(opts.internalIndicator.value));
    }
  }

  return {
    sub,
    username,
    tenantId,
    isInternal,
    roles,
    raw: claims as Record<string, unknown>,
  };
}

// ============ Check authorization ============

/**
 * Kiểm tra auth context có thỏa requirements không.
 * Trả về UseCaseError (FORBIDDEN) nếu không đủ quyền; void nếu OK.
 */
export function checkAuthorization(
  authContext: AuthContext | null,
  requirements: AuthRequirements
): void | UseCaseError {
  const { access, scope, roles: allowedRoles } = requirements;

  if (access === "public") {
    if (scope === undefined && !allowedRoles?.length) return;
    if (!authContext) {
      return {
        code: USE_CASE_ERROR_CODES.FORBIDDEN,
        message: "This action requires authentication",
      };
    }
  } else {
    if (!authContext) {
      return {
        code: USE_CASE_ERROR_CODES.UNAUTHORIZED,
        message: "Authentication required",
      };
    }
  }

  const auth = authContext!;

  if (scope !== undefined) {
    const hasTenant = Boolean(auth.tenantId);
    const isInternal = auth.isInternal;
    switch (scope) {
      case "internal":
        if (!isInternal) {
          return {
            code: USE_CASE_ERROR_CODES.FORBIDDEN,
            message: "Internal account required",
          };
        }
        break;
      case "player":
        if (!hasTenant) {
          return {
            code: USE_CASE_ERROR_CODES.FORBIDDEN,
            message: "Tenant context required",
          };
        }
        break;
      case "agent":
        if (!isInternal || !hasTenant) {
          return {
            code: USE_CASE_ERROR_CODES.FORBIDDEN,
            message: "Internal account with tenant context required",
          };
        }
        break;
    }
  }

  if (allowedRoles != null && allowedRoles.length > 0) {
    const hasRole = allowedRoles.some((r) => auth.roles.includes(r));
    if (!hasRole) {
      return {
        code: USE_CASE_ERROR_CODES.FORBIDDEN,
        message: "Insufficient permissions",
        details: { requiredRoles: allowedRoles },
      };
    }
  }

  return undefined;
}

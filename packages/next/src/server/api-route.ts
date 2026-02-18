/**
 * Next.js API Route wrapper – fluent builder pattern.
 *
 * Pipeline: auth → body → query → params → handler → error catch.
 * Mỗi method optional, chỉ gọi khi cần. Handler kết thúc chain.
 *
 * Response format chuẩn ApiResponse:
 * - Success: { success: true, data: T }
 * - Error:   { success: false, error: { code, message, details? } }
 *
 * Auth: better-auth session được resolve từ request cookies (server-side).
 * Gọi .auth() → bắt buộc login. Truyền roles nếu cần phân quyền.
 * Không gọi .auth() → public route.
 *
 * @example
 * // POST – auth required + roles
 * export const POST = withApi()
 *   .auth({ roles: ["Admin"] })
 *   .body(createAccountSchema)
 *   .handler(async ({ body, session }) => {
 *     return apiSuccess(result, { status: 201 });
 *   });
 *
 * // GET – auth required
 * export const GET = withApi()
 *   .auth()
 *   .query(listQuerySchema)
 *   .handler(async ({ query }) => {
 *     return apiSuccess(result);
 *   });
 *
 * // Public route – no auth
 * export const GET = withApi()
 *   .handler(async () => {
 *     return apiSuccess({ status: "ok" });
 *   });
 */

import { type NextRequest, NextResponse } from "next/server";
import type { z } from "zod";
import { APP_ERROR_CODES } from "@megawin/shared/errors";
import { apiError, catchToApiResponse, validationError } from "./response";

// ============ Types ============

export interface RouteSession {
  user: {
    id: string;
    email?: string;
    name?: string;
    roles?: string[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export type GetSessionFn = (req: NextRequest) => Promise<RouteSession | null>;

export interface RouteAuthRequirements {
  /** Roles cho phép (ít nhất 1). Nếu không set → chỉ check login. */
  roles?: string[];
}

export interface RouteContext<
  TBody = undefined,
  TQuery = undefined,
  TParams = Record<string, string>,
> {
  body: TBody;
  query: TQuery;
  params: TParams;
  session: RouteSession | null;
  request: NextRequest;
}

export type NextRouteHandler = (
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>> }
) => Promise<NextResponse>;

// ============ Parse Query Params ============

function parseQueryParams(req: NextRequest): Record<string, string> {
  const result: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((value: string, key: string) => {
    result[key] = value;
  });
  return result;
}

// ============ Builder ============

interface BuilderConfig {
  getSession?: GetSessionFn;
  authRequirements?: RouteAuthRequirements;
  bodySchema?: z.ZodType<unknown>;
  querySchema?: z.ZodType<unknown>;
  paramsSchema?: z.ZodType<unknown>;
}

export class ApiRouteBuilder<
  TBody = undefined,
  TQuery = undefined,
  TParams = Record<string, string>,
> {
  private readonly config: BuilderConfig;

  constructor(config: BuilderConfig) {
    this.config = config;
  }

  /** Yêu cầu authentication. Truyền options nếu cần phân quyền theo roles. */
  auth(
    requirements?: RouteAuthRequirements
  ): ApiRouteBuilder<TBody, TQuery, TParams> {
    return new ApiRouteBuilder<TBody, TQuery, TParams>({
      ...this.config,
      authRequirements: { ...requirements },
    });
  }

  body<T>(schema: z.ZodType<T>): ApiRouteBuilder<T, TQuery, TParams> {
    return new ApiRouteBuilder<T, TQuery, TParams>({
      ...this.config,
      bodySchema: schema as z.ZodType<unknown>,
    });
  }

  query<T>(schema: z.ZodType<T>): ApiRouteBuilder<TBody, T, TParams> {
    return new ApiRouteBuilder<TBody, T, TParams>({
      ...this.config,
      querySchema: schema as z.ZodType<unknown>,
    });
  }

  params<T>(schema: z.ZodType<T>): ApiRouteBuilder<TBody, TQuery, T> {
    return new ApiRouteBuilder<TBody, TQuery, T>({
      ...this.config,
      paramsSchema: schema as z.ZodType<unknown>,
    });
  }

  handler(
    fn: (ctx: RouteContext<TBody, TQuery, TParams>) => Promise<NextResponse>
  ): NextRouteHandler {
    const cfg = this.config;

    return async (
      req: NextRequest,
      routeCtx: { params: Promise<Record<string, string>> }
    ) => {
      try {
        // 1. Auth
        let session: RouteSession | null = null;
        if (cfg.authRequirements) {
          if (!cfg.getSession) {
            throw new Error(
              "ApiRouteBuilder: auth is configured but getSession is not provided. " +
                "Use createApiRouteBuilder() to bind getSession once."
            );
          }
          session = await cfg.getSession(req);

          if (!session) {
            return apiError(401, {
              code: APP_ERROR_CODES.UNAUTHORIZED,
              message: "Authentication required",
            });
          }

          if (cfg.authRequirements.roles?.length) {
            const userRoles = session.user.roles ?? [];
            const hasRole = cfg.authRequirements.roles.some((r) =>
              userRoles.includes(r)
            );
            if (!hasRole) {
              return apiError(403, {
                code: APP_ERROR_CODES.FORBIDDEN,
                message: "Insufficient permissions",
                details: { requiredRoles: cfg.authRequirements.roles },
              });
            }
          }
        }

        // 2. Parse & validate body
        let body: TBody = undefined as TBody;
        if (cfg.bodySchema) {
          let rawBody: unknown;
          try {
            rawBody = await req.json();
          } catch {
            return validationError("Invalid JSON body");
          }
          const result = cfg.bodySchema.safeParse(rawBody);
          if (!result.success) {
            return validationError("Validation failed", result.error.flatten());
          }
          body = result.data as TBody;
        }

        // 3. Parse & validate query
        let query: TQuery = undefined as TQuery;
        if (cfg.querySchema) {
          const rawQuery = parseQueryParams(req);
          const result = cfg.querySchema.safeParse(rawQuery);
          if (!result.success) {
            return validationError(
              "Query validation failed",
              result.error.flatten()
            );
          }
          query = result.data as TQuery;
        }

        // 4. Parse & validate params
        const rawParams = await routeCtx.params;
        let params: TParams;
        if (cfg.paramsSchema) {
          const result = cfg.paramsSchema.safeParse(rawParams);
          if (!result.success) {
            return validationError(
              "Params validation failed",
              result.error.flatten()
            );
          }
          params = result.data as TParams;
        } else {
          params = rawParams as unknown as TParams;
        }

        // 5. Call handler
        return await fn({ body, query, params, session, request: req });
      } catch (err) {
        return catchToApiResponse(err);
      }
    };
  }
}

// ============ Factory ============

/**
 * Tạo ApiRouteBuilder đã bind sẵn getSession.
 *
 * @example
 * // lib/api.ts
 * import { createApiRouteBuilder } from "@megawin/next/server";
 * export const withApi = createApiRouteBuilder({ getSession });
 *
 * // app/api/users/route.ts
 * export const POST = withApi()
 *   .auth()
 *   .body(schema)
 *   .handler(async ({ body }) => apiSuccess(result, { status: 201 }));
 */
export function createApiRouteBuilder(defaults: { getSession: GetSessionFn }) {
  return function withApi(): ApiRouteBuilder {
    return new ApiRouteBuilder({ getSession: defaults.getSession });
  };
}

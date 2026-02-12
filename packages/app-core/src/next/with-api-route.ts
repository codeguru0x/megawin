/**
 * Next.js API Route wrapper – fluent builder pattern.
 *
 * Pipeline: auth → body → query → params → handler → error catch.
 * Mỗi method optional, chỉ gọi khi cần. Handler kết thúc chain.
 *
 * @example
 * // POST – full pipeline
 * export const POST = withApi()
 *   .auth({ required: true, roles: ["Admin"] })
 *   .body(createAccountSchema)
 *   .handler(async ({ body, session }) => {
 *     const useCase = new CreateCompanyAccountUseCase();
 *     return useCase.run(body, { successStatus: 201 });
 *   });
 *
 * // GET – query only
 * export const GET = withApi()
 *   .auth({ required: true })
 *   .query(listQuerySchema)
 *   .handler(async ({ query }) => {
 *     const useCase = new ListCompanyAccountsUseCase();
 *     return useCase.run(query);
 *   });
 *
 * // Public route – no auth
 * export const GET = withApi()
 *   .handler(async ({ request }) => {
 *     return NextResponse.json({ status: "ok" });
 *   });
 */

import { type NextRequest, NextResponse } from "next/server";
import type { z } from "zod";
import {
  APP_ERROR_CODES,
  AppException,
  isAppError,
  toHttpErrorResponse,
} from "@megawin/shared/errors";

// ============ Types ============

/** Session object từ auth provider (better-auth, next-auth, etc.) */
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

/** Function lấy session từ request – inject từ app (better-auth, next-auth, etc.) */
export type GetSessionFn = (req: NextRequest) => Promise<RouteSession | null>;

/** Auth requirements cho route. */
export interface RouteAuthRequirements {
  /** Bắt buộc đăng nhập? */
  required: boolean;
  /** Roles cho phép (ít nhất 1). Nếu không set → chỉ check login. */
  roles?: string[];
}

/** Context truyền vào handler function. */
export interface RouteContext<TBody = undefined, TQuery = undefined, TParams = Record<string, string>> {
  /** Parsed + validated body (POST/PUT/PATCH). undefined nếu không có bodySchema. */
  body: TBody;
  /** Parsed + validated query params. undefined nếu không có querySchema. */
  query: TQuery;
  /** Dynamic route params (từ Next.js). */
  params: TParams;
  /** Session (non-null nếu auth.required = true). */
  session: RouteSession | null;
  /** Raw NextRequest. */
  request: NextRequest;
}

/** Next.js route handler signature. */
export type NextRouteHandler = (
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>> },
) => Promise<NextResponse>;

// ============ Error Response Helpers ============

function validationErrorResponse(message: string, details?: unknown): NextResponse {
  const error = { code: APP_ERROR_CODES.VALIDATION, message, details };
  const { statusCode, body } = toHttpErrorResponse(error);
  return NextResponse.json(body, { status: statusCode });
}

function errorResponse(err: unknown): NextResponse {
  if (err instanceof AppException) {
    const { statusCode, body } = toHttpErrorResponse(err.toError());
    return NextResponse.json(body, { status: statusCode });
  }
  if (isAppError(err)) {
    const { statusCode, body } = toHttpErrorResponse(err);
    return NextResponse.json(body, { status: statusCode });
  }
  const message = err instanceof Error ? err.message : "Unknown error";
  const { statusCode, body } = toHttpErrorResponse({
    code: APP_ERROR_CODES.INTERNAL,
    message,
  });
  return NextResponse.json(body, { status: statusCode });
}

// ============ Parse Query Params ============

function parseQueryParams(req: NextRequest): Record<string, string> {
  const result: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((value: string, key: string) => {
    result[key] = value;
  });
  return result;
}

// ============ Builder ============

/** Internal config accumulated by builder methods. */
interface BuilderConfig {
  getSession?: GetSessionFn;
  authRequirements?: RouteAuthRequirements;
  bodySchema?: z.ZodType<unknown>;
  querySchema?: z.ZodType<unknown>;
  paramsSchema?: z.ZodType<unknown>;
}

/**
 * Fluent builder – type-safe chain.
 * Mỗi .body() / .query() / .params() trả builder mới với generic type cập nhật.
 * .handler() kết thúc chain, trả NextRouteHandler.
 */
export class ApiRouteBuilder<
  TBody = undefined,
  TQuery = undefined,
  TParams = Record<string, string>,
> {
  private readonly config: BuilderConfig;

  constructor(config: BuilderConfig) {
    this.config = config;
  }

  /** Check auth – required, roles. */
  auth(requirements: RouteAuthRequirements): ApiRouteBuilder<TBody, TQuery, TParams> {
    return new ApiRouteBuilder<TBody, TQuery, TParams>({
      ...this.config,
      authRequirements: requirements,
    });
  }

  /** Validate request body bằng Zod schema (POST/PUT/PATCH). */
  body<T>(schema: z.ZodType<T>): ApiRouteBuilder<T, TQuery, TParams> {
    return new ApiRouteBuilder<T, TQuery, TParams>({
      ...this.config,
      bodySchema: schema as z.ZodType<unknown>,
    });
  }

  /** Validate query params bằng Zod schema. */
  query<T>(schema: z.ZodType<T>): ApiRouteBuilder<TBody, T, TParams> {
    return new ApiRouteBuilder<TBody, T, TParams>({
      ...this.config,
      querySchema: schema as z.ZodType<unknown>,
    });
  }

  /** Validate dynamic route params bằng Zod schema. */
  params<T>(schema: z.ZodType<T>): ApiRouteBuilder<TBody, TQuery, T> {
    return new ApiRouteBuilder<TBody, TQuery, T>({
      ...this.config,
      paramsSchema: schema as z.ZodType<unknown>,
    });
  }

  /**
   * Kết thúc chain – trả Next.js route handler function.
   * Handler nhận RouteContext đã parse + validate, trả NextResponse.
   */
  handler(
    fn: (ctx: RouteContext<TBody, TQuery, TParams>) => Promise<NextResponse>,
  ): NextRouteHandler {
    const cfg = this.config;

    return async (req: NextRequest, routeCtx: { params: Promise<Record<string, string>> }) => {
      try {
        // 1. Auth check
        let session: RouteSession | null = null;
        if (cfg.authRequirements) {
          if (!cfg.getSession) {
            throw new Error(
              "ApiRouteBuilder: auth is configured but getSession is not provided. " +
              "Use createApiRouteBuilder() to bind getSession once.",
            );
          }
          session = await cfg.getSession(req);

          if (cfg.authRequirements.required && !session) {
            const { statusCode, body } = toHttpErrorResponse({
              code: APP_ERROR_CODES.UNAUTHORIZED,
              message: "Authentication required",
            });
            return NextResponse.json(body, { status: statusCode });
          }

          if (cfg.authRequirements.roles?.length && session) {
            const userRoles = session.user.roles ?? [];
            const hasRole = cfg.authRequirements.roles.some((r) => userRoles.includes(r));
            if (!hasRole) {
              const { statusCode, body } = toHttpErrorResponse({
                code: APP_ERROR_CODES.FORBIDDEN,
                message: "Insufficient permissions",
                details: { requiredRoles: cfg.authRequirements.roles },
              });
              return NextResponse.json(body, { status: statusCode });
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
            return validationErrorResponse("Invalid JSON body");
          }
          const result = cfg.bodySchema.safeParse(rawBody);
          if (!result.success) {
            return validationErrorResponse(
              "Validation failed",
              result.error.flatten(),
            );
          }
          body = result.data as TBody;
        }

        // 3. Parse & validate query
        let query: TQuery = undefined as TQuery;
        if (cfg.querySchema) {
          const rawQuery = parseQueryParams(req);
          const result = cfg.querySchema.safeParse(rawQuery);
          if (!result.success) {
            return validationErrorResponse(
              "Query validation failed",
              result.error.flatten(),
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
            return validationErrorResponse(
              "Params validation failed",
              result.error.flatten(),
            );
          }
          params = result.data as TParams;
        } else {
          params = rawParams as unknown as TParams;
        }

        // 5. Call handler
        return await fn({ body, query, params, session, request: req });
      } catch (err) {
        return errorResponse(err);
      }
    };
  }
}

// ============ Factory ============

/**
 * Tạo ApiRouteBuilder đã bind sẵn getSession – dùng ở app level.
 *
 * @example
 * // lib/api.ts
 * import { createApiRouteBuilder } from "@megawin/app-core/next";
 * export const withApi = createApiRouteBuilder({ getSession });
 *
 * // route.ts
 * export const POST = withApi()
 *   .auth({ required: true })
 *   .body(schema)
 *   .handler(async ({ body }) => { ... });
 */
export function createApiRouteBuilder(defaults: { getSession: GetSessionFn }) {
  return function withApi(): ApiRouteBuilder {
    return new ApiRouteBuilder({ getSession: defaults.getSession });
  };
}

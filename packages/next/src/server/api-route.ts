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
 * // POST – auth required + roles, raw output tự bọc { success: true, data } status 200
 * export const POST = withApi()
 *   .auth({ roles: ["Admin"] })
 *   .body(createAccountSchema)
 *   .handler(async ({ body, session }) => {
 *     return useCase.run(body);
 *   });
 *
 * // GET – auth required
 * export const GET = withApi()
 *   .auth()
 *   .query(listQuerySchema)
 *   .handler(async ({ query }) => {
 *     return useCase.run(query);
 *   });
 *
 * // Public route – no auth
 * export const GET = withApi()
 *   .handler(async () => {
 *     return { status: "ok" };
 *   });
 *
 * // Cần status/headers riêng (khác 200) → trả tường minh apiSuccess(), builder pass-through
 * // vì apiSuccess() trả về NextResponse (instanceof Response).
 * export const POST = withApi()
 *   .handler(async () => {
 *     return apiSuccess(result, { status: 201 });
 *   });
 */

import type { NextRequest, NextResponse } from "next/server";

import { APP_ERROR_CODES } from "@megawin/shared/errors";
import type { z } from "zod";

import { apiError, apiSuccess, catchToApiResponse, validationError } from "./response";

// ============ Read-only HTTP methods ============

const READ_ONLY_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// ============ Types ============

export interface RouteSession<TRole extends string = string> {
  user: {
    id: string;
    sub: string;
    email: string;
    name: string;
    username: string;
    roles: TRole[];
    accountStatus: string;
    accountId: string;
    tenantId: string;
    accountType: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export type GetSessionFn<TRole extends string = string> = (req: NextRequest) => Promise<RouteSession<TRole> | null>;

export interface RouteAuthRequirements<TRole extends string = string> {
  /** Roles cho phép (ít nhất 1). Nếu không set → chỉ check login. */
  roles?: TRole[];
}

export interface RouteContext<
  TBody = undefined,
  TQuery = undefined,
  TParams = Record<string, string>,
  TRole extends string = string,
> {
  body: TBody;
  query: TQuery;
  params: TParams;
  session: RouteSession<TRole> | null;
  request: NextRequest;
}

export type NextRouteHandler = (
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>> },
) => Promise<Response>;

// ============ Parse Query Params ============

function parseQueryParams(req: NextRequest): Record<string, string> {
  const result: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((value: string, key: string) => {
    result[key] = value;
  });
  return result;
}

// ============ Builder ============

interface BuilderConfig<TRole extends string = string> {
  getSession?: GetSessionFn<TRole>;
  superRoles?: TRole[];
  authRequirements?: RouteAuthRequirements<TRole>;
  bodySchema?: z.ZodType<unknown>;
  querySchema?: z.ZodType<unknown>;
  paramsSchema?: z.ZodType<unknown>;
}

export class ApiRouteBuilder<
  TBody = undefined,
  TQuery = undefined,
  TParams = Record<string, string>,
  TRole extends string = string,
> {
  private readonly config: BuilderConfig<TRole>;

  constructor(config: BuilderConfig<TRole>) {
    this.config = config;
  }

  /** Yêu cầu authentication. Truyền options nếu cần phân quyền theo roles. */
  auth(requirements?: RouteAuthRequirements<TRole>): ApiRouteBuilder<TBody, TQuery, TParams, TRole> {
    return new ApiRouteBuilder<TBody, TQuery, TParams, TRole>({
      ...this.config,
      authRequirements: { ...requirements },
    });
  }

  body<T>(schema: z.ZodType<T>): ApiRouteBuilder<T, TQuery, TParams, TRole> {
    return new ApiRouteBuilder<T, TQuery, TParams, TRole>({
      ...this.config,
      bodySchema: schema as z.ZodType<unknown>,
    });
  }

  query<T>(schema: z.ZodType<T>): ApiRouteBuilder<TBody, T, TParams, TRole> {
    return new ApiRouteBuilder<TBody, T, TParams, TRole>({
      ...this.config,
      querySchema: schema as z.ZodType<unknown>,
    });
  }

  params<T>(schema: z.ZodType<T>): ApiRouteBuilder<TBody, TQuery, T, TRole> {
    return new ApiRouteBuilder<TBody, TQuery, T, TRole>({
      ...this.config,
      paramsSchema: schema as z.ZodType<unknown>,
    });
  }

  handler<T>(
    fn: (ctx: RouteContext<TBody, TQuery, TParams, TRole>) => Promise<NextResponse | Response | T>,
  ): NextRouteHandler {
    const cfg = this.config;

    return async (req: NextRequest, routeCtx: { params: Promise<Record<string, string>> }) => {
      try {
        // 1. Auth
        let session: RouteSession<TRole> | null = null;
        if (cfg.authRequirements) {
          if (!cfg.getSession) {
            throw new Error(
              "ApiRouteBuilder: auth is configured but getSession is not provided. " +
                "Use createApiRouteBuilder() to bind getSession once.",
            );
          }
          // biome-ignore lint/nursery/useAwaitThenable: GetSessionFn luôn trả Promise<RouteSession | null>; Biome chưa resolve được return type qua generic type alias (limitation type inference đã ghi ở p1-01).
          session = await cfg.getSession(req);

          if (!session) {
            return apiError(401, {
              code: APP_ERROR_CODES.UNAUTHORIZED,
              message: "Authentication required",
            });
          }

          const status = session.user.accountStatus;

          if (status === "suspended") {
            return apiError(403, {
              code: APP_ERROR_CODES.ACCOUNT_SUSPENDED,
              message: "Account is suspended",
            });
          }

          if (status === "read_only") {
            const isReadOnly = READ_ONLY_METHODS.has(req.method.toUpperCase());
            if (!isReadOnly) {
              return apiError(403, {
                code: APP_ERROR_CODES.ACCOUNT_READ_ONLY,
                message: "Account is read-only, mutation operations are not allowed",
              });
            }
          }

          if (cfg.authRequirements.roles?.length) {
            const userRoles = session.user.roles;
            const hasSuperRole = cfg.superRoles?.some((r) => userRoles.includes(r));
            if (!hasSuperRole) {
              const hasRole = cfg.authRequirements.roles.some((r) => userRoles.includes(r));
              if (!hasRole) {
                return apiError(403, {
                  code: APP_ERROR_CODES.FORBIDDEN,
                  message: "Insufficient permissions",
                  details: { requiredRoles: cfg.authRequirements.roles },
                });
              }
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
            return validationError("Validation failed", result.error);
          }
          body = result.data as TBody;
        }

        // 3. Parse & validate query
        let query: TQuery = undefined as TQuery;
        if (cfg.querySchema) {
          const rawQuery = parseQueryParams(req);
          const result = cfg.querySchema.safeParse(rawQuery);
          if (!result.success) {
            return validationError("Query validation failed", result.error);
          }
          query = result.data as TQuery;
        }

        // 4. Parse & validate params
        const rawParams = await routeCtx.params;
        let params: TParams;
        if (cfg.paramsSchema) {
          const result = cfg.paramsSchema.safeParse(rawParams);
          if (!result.success) {
            return validationError("Params validation failed", result.error);
          }
          params = result.data as TParams;
        } else {
          params = rawParams as unknown as TParams;
        }

        // 5. Call handler — raw value tự bọc { success: true, data } status 200.
        // Response/NextResponse (kể cả streaming, hoặc apiSuccess()/apiError() tường minh) đi thẳng.
        const result = await fn({ body, query, params, session, request: req });
        return result instanceof Response ? result : apiSuccess(result);
      } catch (err) {
        return catchToApiResponse(err);
      }
    };
  }
}

// ============ Factory ============

/**
 * FACTORY generic (framework layer) — tạo route builder đã bind sẵn getSession cho 1 app cụ thể.
 * Bản thân hàm này KHÔNG biết gì về app nào gọi nó (không import better-auth, không biết role union
 * cụ thể) — mỗi app tự gọi 1 LẦN DUY NHẤT trong `src/lib/api.ts` của mình để "đóng gói" (bind)
 * `getSession`/`superRoles` riêng, rồi export ra `withApi` ngắn gọn dùng khắp route của app đó.
 *
 * KHÔNG nhầm với `withApi` mà app export — đây là 2 vai trò khác nhau (factory vs instance đã bind),
 * chỉ tình cờ đặt tên giống ở call-site vì đó là tên ergonomic cho consumer.
 *
 * @param defaults.getSession – resolve session từ request.
 * @param defaults.superRoles – roles bypass mọi role check (vd Admin).
 *
 * @example
 * // lib/api.ts — GỌI 1 LẦN, bind getSession/superRoles riêng của app này
 * import { createApiRouteBuilder } from "@megawin/next/server";
 * export const withApi = createApiRouteBuilder<AccountRole>({
 *   getSession,
 *   superRoles: [CompanyRole.Admin],
 * });
 *
 * // app/api/users/route.ts – DÙNG lại withApi đã bind ở trên, khắp mọi route.
 * // Chỉ Staff mới cần khai báo, Admin tự động pass (superRoles).
 * // Raw output tự bọc { success: true, data } status 200:
 * export const POST = withApi()
 *   .auth({ roles: [CompanyRole.Staff] })
 *   .body(schema)
 *   .handler(async ({ body }) => useCase.run(body));
 */
export function createApiRouteBuilder<TRole extends string = string>(defaults: {
  getSession: GetSessionFn<TRole>;
  superRoles?: TRole[];
}) {
  // Đặt tên khác "withApi" có chủ đích — tránh literal string trùng với const app export (dễ nhầm
  // khi grep/đọc file này). App gọi hàm này rồi TỰ đặt tên export là `withApi` ở lib/api.ts riêng.
  return function boundApiRouteBuilder(): ApiRouteBuilder<undefined, undefined, Record<string, string>, TRole> {
    return new ApiRouteBuilder<undefined, undefined, Record<string, string>, TRole>({
      getSession: defaults.getSession,
      superRoles: defaults.superRoles,
    });
  };
}

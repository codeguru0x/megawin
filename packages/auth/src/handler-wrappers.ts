/**
 * Middy wrapper factories cho API Gateway Lambda handler.
 *
 * Mỗi wrapper = 1 auth middleware + bộ middleware chung (validator → success envelope →
 * error handler), gắn qua `buildHandler()` duy nhất.
 *
 * Schema types tự infer từ options — KHÔNG cần khai báo interface.
 * Raw output của handler (vd `useCase.run(input)`) tự bọc `{ success: true, data }` status 200
 * qua `successEnvelopeMiddleware` — facade tương đương Next.js `ApiRouteBuilder.handler()`.
 *
 * @example
 * import { withPlayerAuth } from "@megawin/auth";
 *
 * export const handler = withPlayerAuth(
 *   async (event) => {
 *     event.user.sub;           // typed
 *     event.schema.body.name;   // typed từ bodySchema
 *     return useCase.run(input); // raw output — tự bọc success envelope
 *   },
 *   { schemas: { body: bodySchema, path: pathSchema } },
 * );
 *
 * // Endpoint public — không auth (vd refresh-token, health-check):
 * export const handler = withPublicHandler(
 *   async (event) => useCase.run(event.schema.body),
 *   { schemas: { body: bodySchema } },
 * );
 */

import {
  httpErrorHandlerUseCaseFormat,
  successEnvelopeMiddleware,
  validatorZodMiddleware,
  type ApiGatewayZodSchemas,
} from "@megawin/app-core/lambda/middleware";
import middy, { type MiddlewareObj } from "@middy/core";
import type { APIGatewayProxyEventV2 } from "aws-lambda/trigger/api-gateway-proxy";
import type { z } from "zod";

import {
  agentAuth,
  companyAuth,
  playerAuth,
  type CompanyAuthOptions,
  type CompanyUserEvent,
  type TenantUserEvent,
  type UserAuthOptions,
} from "./authorization-middleware";
import { rateLimitMiddleware, type HandlerRateLimitOptions } from "./rate-limit";

export type { HandlerRateLimitOptions };
export { RateLimitMode, resolveRateLimitMode, resolveRateLimitSubject } from "./rate-limit";

export type { CompanyUserEvent, TenantUserEvent };

// ============ Type-level helpers ============

/**
 * Middleware bất kỳ của middy. Dùng `MiddlewareObj` chính thống của middy thay vì tự khai báo
 * lại shape `{ before?, after?, onError? }` — tránh lệch khi middy nâng version.
 */
type AnyMiddleware = MiddlewareObj<any, any, any, any, any>;

/**
 * Handler thô truyền vào middy — event type thật do generic ở từng hàm `with*` quyết định
 * (typed tại signature public, xem `WithSchema`).
 */
type RawHandler = (event: any) => Promise<unknown>;

/**
 * Infer `event.schema` từ Zod schemas đã khai báo. Field không khai báo schema → `never`
 * (truy cập vào là lỗi compile, đúng ý: không có schema thì không có data đã validate).
 */
export type InferSchema<T> = T extends ApiGatewayZodSchemas
  ? {
      body: T["body"] extends z.ZodType ? z.infer<T["body"]> : never;
      path: T["path"] extends z.ZodType ? z.infer<T["path"]> : never;
      query: T["query"] extends z.ZodType ? z.infer<T["query"]> : never;
    }
  : Record<string, never>;

/**
 * Base event + field `schema` CHỈ khi caller khai báo `schemas`.
 * Không khai báo → `event.schema` không tồn tại (truy cập = lỗi compile).
 *
 * Dùng chung cho cả 4 wrapper (player/agent/company/public) và `withTenantAuth` —
 * trước đây mỗi chỗ tự viết lại cùng conditional type này.
 */
export type WithSchema<TBase, TSchemas> = TSchemas extends ApiGatewayZodSchemas
  ? TBase & { schema: InferSchema<TSchemas> }
  : TBase;

// ============ Internal builder ============

/** Options nội bộ của `buildHandler` — không export positional param mới ra `apps/`. */
export interface BuildHandlerOptions {
  schemas?: ApiGatewayZodSchemas;
  auth?: AnyMiddleware;
  rateLimit?: HandlerRateLimitOptions;
}

/**
 * Builder duy nhất cho mọi wrapper. `auth` optional — không truyền = endpoint public.
 *
 * THỨ TỰ middleware: auth → rateLimit → validatorZod → success envelope → error handler.
 * Rate limit sau auth (cần identity), trước Zod (không parse body kẻ spam).
 */
export function buildHandler(fn: RawHandler, options: BuildHandlerOptions = {}) {
  const { schemas, auth, rateLimit } = options;
  const middlewares: AnyMiddleware[] = [];
  if (auth) {
    middlewares.push(auth);
  }
  if (rateLimit) {
    middlewares.push(rateLimitMiddleware(rateLimit));
  }
  if (schemas) {
    middlewares.push(validatorZodMiddleware(schemas));
  }
  middlewares.push(successEnvelopeMiddleware(), httpErrorHandlerUseCaseFormat());

  return middy(fn).use(middlewares);
}

// ============ Player ============

export function withPlayerAuth<TSchemas extends ApiGatewayZodSchemas | undefined = undefined>(
  fn: (event: WithSchema<TenantUserEvent, TSchemas>) => Promise<unknown>,
  options?: UserAuthOptions & { schemas?: TSchemas; rateLimit?: HandlerRateLimitOptions },
) {
  const { schemas, rateLimit, ...authOptions } = options ?? {};
  return buildHandler(fn, { schemas, auth: playerAuth(authOptions), rateLimit });
}

// ============ Agent ============

export function withAgentAuth<TSchemas extends ApiGatewayZodSchemas | undefined = undefined>(
  fn: (event: WithSchema<TenantUserEvent, TSchemas>) => Promise<unknown>,
  options?: UserAuthOptions & { schemas?: TSchemas; rateLimit?: HandlerRateLimitOptions },
) {
  const { schemas, rateLimit, ...authOptions } = options ?? {};
  return buildHandler(fn, { schemas, auth: agentAuth(authOptions), rateLimit });
}

// ============ Company ============

export function withCompanyAuth<TSchemas extends ApiGatewayZodSchemas | undefined = undefined>(
  fn: (event: WithSchema<CompanyUserEvent, TSchemas>) => Promise<unknown>,
  options?: CompanyAuthOptions & { schemas?: TSchemas; rateLimit?: HandlerRateLimitOptions },
) {
  const { schemas, rateLimit, ...authOptions } = options ?? {};
  return buildHandler(fn, { schemas, auth: companyAuth(authOptions), rateLimit });
}

// ============ Public (KHÔNG auth) ============

/**
 * Base handler KHÔNG auth — dùng cho endpoint public (refresh-token, health-check, config
 * public…). Vẫn có đầy đủ validator/success-envelope/error-handler như các `with*Auth` khác,
 * chỉ thiếu bước auth middleware.
 *
 * Base event là `APIGatewayProxyEventV2` (KHÔNG có authorizer claims vì không qua auth) —
 * handler vẫn đọc được `event.headers`, `event.requestContext.http.sourceIp`… cho rate-limit/log.
 */
export function withPublicHandler<TSchemas extends ApiGatewayZodSchemas | undefined = undefined>(
  fn: (event: WithSchema<APIGatewayProxyEventV2, TSchemas>) => Promise<unknown>,
  options?: { schemas?: TSchemas; rateLimit?: HandlerRateLimitOptions },
) {
  return buildHandler(fn, { schemas: options?.schemas, rateLimit: options?.rateLimit });
}

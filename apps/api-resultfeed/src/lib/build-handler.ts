/**
 * Compose middy handler CỤC BỘ cho `apps/api-resultfeed` — chỉ app này dùng, KHÔNG export
 * ra ngoài app, KHÔNG tách package dùng chung.
 *
 * Mirror `packages/auth/src/handler-wrappers.ts` (builder của API core) nhưng viết lại tối
 * giản: chỉ 1 loại auth (API key), không cần đủ 4 wrapper player/agent/company/public. 2
 * type helper `WithSchema`/`InferSchema` COPY RÚT GỌN từ file đó — chủ đích KHÔNG import
 * `@megawin/auth` để tránh kéo theo dependency `identity` vào bundle Lambda này.
 *
 * @example
 * export const handler = withResultFeedApiKeyAuth(
 *   async (event) => pullResultsUseCase.run(event.schema.query),
 *   { schemas: { query: querySchema } },
 * );
 */

import {
  type ApiGatewayZodSchemas,
  httpErrorHandlerUseCaseFormat,
  successEnvelopeMiddleware,
  validatorZodMiddleware,
} from "@megawin/app-core/lambda/middleware";
import middy, { type MiddlewareObj } from "@middy/core";
import type { APIGatewayProxyEventV2 } from "aws-lambda/trigger/api-gateway-proxy";
import type { z } from "zod";

import { apiKeyAuthMiddleware } from "./api-key-auth";

/**
 * Middleware bất kỳ của middy — dùng `MiddlewareObj` chính thống thay vì tự khai lại shape
 * `{ before?, after?, onError? }`. `any` bắt buộc vì mỗi middleware trong chain có event/result
 * generic khác nhau (auth đọc headers, validator đọc body/path/query) — không narrow được
 * (mirror `packages/auth/src/handler-wrappers.ts`, không import package đó).
 */
// biome-ignore lint/suspicious/noExplicitAny: MiddlewareObj generic theo event/result/context; mỗi middleware trong chain có shape khác nhau nên không narrow được.
type AnyMiddleware = MiddlewareObj<any, any, any, any, any>;

/** Infer `event.schema` từ Zod schemas đã khai báo — field không khai báo → `never`. */
export type InferSchema<T> = T extends ApiGatewayZodSchemas
  ? {
      body: T["body"] extends z.ZodType ? z.infer<T["body"]> : never;
      path: T["path"] extends z.ZodType ? z.infer<T["path"]> : never;
      query: T["query"] extends z.ZodType ? z.infer<T["query"]> : never;
    }
  : Record<string, never>;

/** Base event + field `schema` CHỈ khi caller khai báo `schemas`. */
export type WithSchema<TBase, TSchemas> = TSchemas extends ApiGatewayZodSchemas
  ? TBase & { schema: InferSchema<TSchemas> }
  : TBase;

export function withResultFeedApiKeyAuth<TSchemas extends ApiGatewayZodSchemas | undefined = undefined>(
  fn: (event: WithSchema<APIGatewayProxyEventV2, TSchemas>) => Promise<unknown>,
  options?: { schemas?: TSchemas },
) {
  const middlewares: AnyMiddleware[] = [apiKeyAuthMiddleware()];
  if (options?.schemas) {
    middlewares.push(validatorZodMiddleware(options.schemas));
  }
  middlewares.push(successEnvelopeMiddleware(), httpErrorHandlerUseCaseFormat());

  return middy(fn).use(middlewares);
}

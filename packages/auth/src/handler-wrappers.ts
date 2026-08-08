/**
 * Middy wrapper factories cho API Gateway Lambda handler.
 *
 * Schema types tự infer từ options — KHÔNG cần khai báo interface.
 *
 * @example
 * import { withPlayerAuth } from "@megawin/auth";
 *
 * export const handler = withPlayerAuth(
 *   async (event) => {
 *     event.user.sub;           // typed
 *     event.schema.body.name;   // typed từ bodySchema
 *   },
 *   { schemas: { body: bodySchema, path: pathSchema } },
 * );
 */

import {
  type ApiGatewayZodSchemas,
  httpErrorHandlerUseCaseFormat,
  validatorZodMiddleware,
} from "@megawin/app-core/lambda/middleware";
import middy from "@middy/core";

import {
  agentAuth,
  type CompanyAuthOptions,
  type CompanyUserEvent,
  companyAuth,
  playerAuth,
  type TenantUserEvent,
  type UserAuthOptions,
} from "./authorization-middleware";

export type { CompanyUserEvent, TenantUserEvent };

// ============ Type-level helpers ============

type ZodInfer<T> = T extends { _output: infer O } ? O : never;

export type InferSchema<T> = T extends {
  body?: infer B;
  path?: infer P;
  query?: infer Q;
}
  ? { body: ZodInfer<B>; path: ZodInfer<P>; query: ZodInfer<Q> }
  : Record<string, never>;

type TenantEvent<TSchemas> = TenantUserEvent &
  (TSchemas extends undefined ? unknown : { schema: InferSchema<TSchemas> });

type CompanyEvent<TSchemas> = CompanyUserEvent &
  (TSchemas extends undefined ? unknown : { schema: InferSchema<TSchemas> });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MiddyMiddlewareObject = {
  before: (request: any) => Promise<void | unknown>;
};

// ============ Internal builder ============

function buildHandler(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fn: (event: any) => Promise<unknown>,
  authMiddleware: MiddyMiddlewareObject,
  schemas?: ApiGatewayZodSchemas,
) {
  const wrapped = middy(fn).use(authMiddleware);
  if (schemas) wrapped.use(validatorZodMiddleware(schemas));
  wrapped.use(httpErrorHandlerUseCaseFormat());
  return wrapped;
}

// ============ Player ============

export function withPlayerAuth<TSchemas extends ApiGatewayZodSchemas | undefined = undefined>(
  fn: (event: TenantEvent<TSchemas>) => Promise<unknown>,
  options?: UserAuthOptions & { schemas?: TSchemas },
) {
  const { schemas, ...authOptions } = options ?? {};
  return buildHandler(fn, playerAuth(authOptions), schemas as ApiGatewayZodSchemas | undefined);
}

// ============ Agent ============

export function withAgentAuth<TSchemas extends ApiGatewayZodSchemas | undefined = undefined>(
  fn: (event: TenantEvent<TSchemas>) => Promise<unknown>,
  options?: UserAuthOptions & { schemas?: TSchemas },
) {
  const { schemas, ...authOptions } = options ?? {};
  return buildHandler(fn, agentAuth(authOptions), schemas as ApiGatewayZodSchemas | undefined);
}

// ============ Company ============

export function withCompanyAuth<TSchemas extends ApiGatewayZodSchemas | undefined = undefined>(
  fn: (event: CompanyEvent<TSchemas>) => Promise<unknown>,
  options?: CompanyAuthOptions & { schemas?: TSchemas },
) {
  const { schemas, ...authOptions } = options ?? {};
  return buildHandler(fn, companyAuth(authOptions), schemas as ApiGatewayZodSchemas | undefined);
}

// ============ Generic middleware wrapper ============

export function withMiddleware(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fn: (event: any) => Promise<unknown>,
  authMiddleware: MiddyMiddlewareObject,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options?: { schemas?: any },
) {
  return buildHandler(fn, authMiddleware, options?.schemas);
}

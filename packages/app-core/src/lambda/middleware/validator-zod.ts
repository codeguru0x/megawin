/**
 * Middy middleware: validate API Gateway event với Zod.
 * Hợp với ApiGatewayUseCase (event.validated được dùng trong parseInput).
 * Khi validation fail → trả về 400 và short-circuit (request.earlyResponse).
 *
 * @example
 * import middy from '@middy/core';
 * import { validatorZodMiddleware, httpErrorHandlerUseCaseFormat } from '@megawin/app-core/application/middy';
 * import { runUseCaseAndRespond } from '@megawin/app-core/application/middy';
 * import { z } from 'zod';
 *
 * const bodySchema = z.object({ name: z.string() });
 * const handler = middy(async (event) => {
 *   const response = await runUseCaseAndRespond((e) => myUseCase.run(e), event);
 *   return response;
 * })
 *   .use(validatorZodMiddleware({ body: bodySchema }))
 *   .use(httpErrorHandlerUseCaseFormat());
 */

import { z } from "zod";

/** Schemas cho body, pathParameters, queryStringParameters. Dùng Zod object schema. */
export interface ApiGatewayZodSchemas<TBody = unknown> {
  body?: z.ZodType<TBody>;
  pathParameters?: z.ZodType<Record<string, string>>;
  queryStringParameters?: z.ZodType<Record<string, string>>;
}

/** Format lỗi Zod cho client (có thể tùy chỉnh). */
export function formatZodError(error: z.ZodError): Record<string, unknown> {
  return {
    message: "Validation failed",
    code: "VALIDATION",
    // Use new flatten signature with explicit mapper to avoid deprecated overload
    details: error.flatten((issue) => issue.message),
  };
}

/** Response 400 chuẩn cho validation error. */
const VALIDATION_HEADERS = { "Content-Type": "application/json" };

/**
 * Middleware Middy: validate event.body, pathParameters, queryStringParameters bằng Zod.
 * - Thành công: gán event.validated = { body?, pathParameters?, queryStringParameters? }.
 * - Thất bại: set request.earlyResponse = { statusCode: 400, body: JSON.stringify(error) } (short-circuit).
 *
 * Event.body nếu là string sẽ được parse JSON trước khi validate (trùng với API Gateway).
 */
export function validatorZodMiddleware<TBody = unknown>(
  schemas: ApiGatewayZodSchemas<TBody>
) {
  return {
    before: async (request: {
      event: Record<string, unknown> & {
        body?: string;
        pathParameters?: Record<string, string> | null;
        queryStringParameters?: Record<string, string> | null;
        validated?: {
          body?: TBody;
          pathParameters?: Record<string, string>;
          queryStringParameters?: Record<string, string>;
        };
      };
      earlyResponse?: unknown;
    }) => {
      const { event } = request;
      const validated: {
        body?: TBody;
        pathParameters?: Record<string, string>;
        queryStringParameters?: Record<string, string>;
      } = {};

      try {
        if (schemas.body) {
          let raw: unknown = event.body;
          if (typeof raw === "string" && raw.length > 0) {
            try {
              raw = JSON.parse(raw) as unknown;
            } catch {
              request.earlyResponse = {
                statusCode: 400,
                headers: VALIDATION_HEADERS,
                body: JSON.stringify({
                  message: "Invalid JSON body",
                  code: "VALIDATION",
                }),
              };
              return;
            }
          }
          validated.body = schemas.body.parse(raw) as TBody;
        }

        if (schemas.pathParameters) {
          const path = event.pathParameters ?? {};
          validated.pathParameters = schemas.pathParameters.parse(
            path
          ) as Record<string, string>;
        }

        if (schemas.queryStringParameters) {
          const query = event.queryStringParameters ?? {};
          validated.queryStringParameters = schemas.queryStringParameters.parse(
            query
          ) as Record<string, string>;
        }

        (event as Record<string, unknown>).validated = validated;
      } catch (err) {
        if (err && typeof err === "object" && "flatten" in err) {
          const zodError = err as z.ZodError;
          request.earlyResponse = {
            statusCode: 400,
            headers: VALIDATION_HEADERS,
            body: JSON.stringify(formatZodError(zodError)),
          };
          return;
        }
        throw err;
      }
    },
  };
}

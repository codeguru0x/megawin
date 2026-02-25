/**
 * Middy middleware: validate API Gateway event với Zod v4.
 *
 * Schema keys rút gọn:
 * - body  → validate event.body (JSON)
 * - path  → validate event.pathParameters
 * - query → validate event.queryStringParameters
 *
 * Sau khi validate thành công → gán event.schema:
 * - event.schema.body  (typed theo Zod schema)
 * - event.schema.path  (typed theo Zod schema)
 * - event.schema.query (typed theo Zod schema)
 *
 * @example
 * const bodySchema = z.object({ name: z.string() });
 * const pathSchema = z.object({ id: z.string() });
 *
 * export const handler = withPlayerAuth(
 *   async (event) => {
 *     event.schema.body.name;  // string — typed!
 *     event.schema.path.id;    // string — typed!
 *   },
 *   { schemas: { body: bodySchema, path: pathSchema } },
 * );
 */

import { z } from "zod";

// ============ Schema input (dùng khi khai báo) ============

export interface ApiGatewayZodSchemas<
  TBody = unknown,
  TPath = unknown,
  TQuery = unknown,
> {
  body?: z.ZodType<TBody>;
  path?: z.ZodType<TPath>;
  query?: z.ZodType<TQuery>;
}

// ============ Schema output (dùng trong handler event) ============

/**
 * Type helper: infer event.schema từ Zod schemas đã khai báo.
 *
 * @example
 * const bodySchema = z.object({ name: z.string() });
 * const pathSchema = z.object({ id: z.string() });
 *
 * interface MyEvent extends ApiGatewayEventWithUser {
 *   schema: SchemaOf<typeof bodySchema, typeof pathSchema>;
 * }
 */
export type SchemaOf<
  TBody extends z.ZodType | undefined = undefined,
  TPath extends z.ZodType | undefined = undefined,
  TQuery extends z.ZodType | undefined = undefined,
> = {
  body: TBody extends z.ZodType ? z.infer<TBody> : never;
  path: TPath extends z.ZodType ? z.infer<TPath> : never;
  query: TQuery extends z.ZodType ? z.infer<TQuery> : never;
};

// ============ Helpers ============

const VALIDATION_HEADERS = { "Content-Type": "application/json" };

function buildValidationErrorResponse(error: z.ZodError) {
  return {
    statusCode: 400,
    headers: VALIDATION_HEADERS,
    body: JSON.stringify({
      message: "Validation failed",
      code: "VALIDATION",
      details: z.flattenError(error),
    }),
  };
}

// ============ Middleware ============

/**
 * Middy middleware: validate body / path / query bằng Zod.
 * - Thành công: gán event.schema = { body?, path?, query? }
 * - Thất bại: earlyResponse 400 (short-circuit)
 */
export function validatorZodMiddleware<
  TBody = unknown,
  TPath = unknown,
  TQuery = unknown,
>(schemas: ApiGatewayZodSchemas<TBody, TPath, TQuery>) {
  return {
    before: async (request: {
      event: Record<string, unknown> & {
        body?: string;
        pathParameters?: Record<string, string> | null;
        queryStringParameters?: Record<string, string> | null;
        schema?: { body?: TBody; path?: TPath; query?: TQuery };
      };
      earlyResponse?: unknown;
    }) => {
      const { event } = request;
      const schema: { body?: TBody; path?: TPath; query?: TQuery } = {};

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
          schema.body = schemas.body.parse(raw) as TBody;
        }

        if (schemas.path) {
          schema.path = schemas.path.parse(event.pathParameters ?? {}) as TPath;
        }

        if (schemas.query) {
          schema.query = schemas.query.parse(
            event.queryStringParameters ?? {},
          ) as TQuery;
        }

        (event as Record<string, unknown>).schema = schema;
      } catch (err) {
        if (err instanceof z.ZodError) {
          request.earlyResponse = buildValidationErrorResponse(err);
          return;
        }
        throw err;
      }
    },
  };
}

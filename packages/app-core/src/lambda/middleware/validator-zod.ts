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

import type { ApiErrorResponse } from "@megawin/shared/api-types";
import { APP_ERROR_CODES } from "@megawin/shared/errors";
import { formatZodIssues, isZodErrorLike } from "@megawin/shared/validation";
import type { z } from "zod";

// ============ Schema input (dùng khi khai báo) ============

export interface ApiGatewayZodSchemas<TBody = unknown, TPath = unknown, TQuery = unknown> {
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

/**
 * Bọc lỗi validation vào envelope chuẩn `{ success: false, error: { code, message, details } }` —
 * ĐÚNG shape mà `httpErrorHandlerUseCaseFormat` dùng cho mọi lỗi khác của cùng API.
 *
 * ## Bug đã sửa (14/08/2026): trước đây body phẳng `{ code, message, errors }`
 *
 * Client bóc lỗi bằng `json.error.code` (xem `packages/player-sdk/src/http-client.ts` và
 * `packages/http-client/src/http-client.ts`). Với body phẳng, `json.error` là `undefined` →
 * tenant nhận `code: "UNKNOWN"`, message rơi về `response.statusText` ("Bad Request"), và
 * **mất sạch `errors[]`** nên không biết field nào sai. Tức riêng lỗi validation — loại lỗi client
 * cần chi tiết nhất — lại là loại duy nhất client không đọc được.
 *
 * `errors[]` giờ nằm trong `details` (giống Next.js `validationError`), là chỗ SDK expose qua
 * `ApiClientError.details` và FE `formatErrorToast` đọc để render bullet list theo field.
 *
 * @param message - Message hiển thị. Tách khỏi `errors[]` để client có 1 dòng tóm tắt + chi tiết.
 * @param errors - Danh sách field lỗi; bỏ trống cho lỗi không gắn field nào (vd JSON hỏng).
 */
function buildValidationResponse(message: string, errors?: ReturnType<typeof formatZodIssues>) {
  const body: ApiErrorResponse = {
    success: false,
    error: {
      code: APP_ERROR_CODES.VALIDATION,
      message,
      ...(errors !== undefined && { details: { errors } }),
    },
  };

  return {
    statusCode: 400,
    headers: VALIDATION_HEADERS,
    body: JSON.stringify(body),
  };
}

// ============ Middleware ============

/**
 * Middy middleware: validate body / path / query bằng Zod.
 * - Thành công: gán event.schema = { body?, path?, query? }
 * - Thất bại: earlyResponse 400 (short-circuit)
 */
export function validatorZodMiddleware<TBody = unknown, TPath = unknown, TQuery = unknown>(
  schemas: ApiGatewayZodSchemas<TBody, TPath, TQuery>,
) {
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
              request.earlyResponse = buildValidationResponse("Invalid JSON body");
              return;
            }
          }
          schema.body = schemas.body.parse(raw) as TBody;
        }

        if (schemas.path) {
          schema.path = schemas.path.parse(event.pathParameters ?? {}) as TPath;
        }

        if (schemas.query) {
          schema.query = schemas.query.parse(event.queryStringParameters ?? {}) as TQuery;
        }

        (event as Record<string, unknown>).schema = schema;
      } catch (err) {
        // Nhận diện theo shape, KHÔNG `instanceof z.ZodError`: middleware này và app khai báo schema
        // có thể resolve 2 instance zod khác nhau qua pnpm hoisting → `instanceof` fail âm thầm,
        // ZodError lọt xuống `throw` và thành 500 INTERNAL thay vì 400 VALIDATION.
        if (isZodErrorLike(err)) {
          request.earlyResponse = buildValidationResponse("Dữ liệu không hợp lệ.", formatZodIssues(err));
          return;
        }
        throw err;
      }
    },
  };
}

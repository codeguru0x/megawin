/**
 * HTTP status mapping cho error codes – dùng chung Lambda & Next.js.
 *
 * Ưu tiên: error.statusCode (explicit) → predefined mapping → default 400.
 *
 * Default 400 vì: khi dev throw AppException với custom code → đó là lỗi business
 * đã biết trước (client error), không phải server crash.
 * 500 chỉ dành cho: APP_ERROR_CODES.INTERNAL, SERVICE_UNAVAILABLE, TIMEOUT,
 * hoặc unknown error bắt ở catch block (xử lý riêng trong middleware/use case).
 *
 * @example
 * errorCodeToStatusCode("NOT_FOUND")       // 404 (predefined)
 * errorCodeToStatusCode("SOME_NEW_CODE")   // 400 (default – business error)
 * errorCodeToStatusCode("INTERNAL")        // 500 (predefined)
 *
 * // AppError có statusCode explicit → ưu tiên dùng
 * appErrorToStatusCode({ code: "CUSTOM", message: "...", statusCode: 422 }) // 422
 */

import { APP_ERROR_CODES, type AppError, type AppErrorCode } from "./error-codes";

// ============ Predefined code → status mapping ============

const CODE_STATUS_MAP: Record<string, number> = {
  [APP_ERROR_CODES.VALIDATION]: 400,
  [APP_ERROR_CODES.BAD_REQUEST]: 400,
  [APP_ERROR_CODES.UNAUTHORIZED]: 401,
  [APP_ERROR_CODES.FORBIDDEN]: 403,
  [APP_ERROR_CODES.NOT_FOUND]: 404,
  [APP_ERROR_CODES.CONFLICT]: 409,
  [APP_ERROR_CODES.GONE]: 410,
  [APP_ERROR_CODES.TOO_MANY_REQUESTS]: 429,
  [APP_ERROR_CODES.INTERNAL]: 500,
  [APP_ERROR_CODES.SERVICE_UNAVAILABLE]: 503,
  [APP_ERROR_CODES.TIMEOUT]: 504,

  // Business codes – thêm ở đây nếu muốn default mapping
  [APP_ERROR_CODES.INSUFFICIENT_BALANCE]: 422,
  [APP_ERROR_CODES.ACCOUNT_DISABLED]: 403,
};

/**
 * Map error code → HTTP status code.
 * Predefined codes tra bảng; custom code → 400 (business error).
 * Server errors (500, 503, 504) chỉ khi code nằm trong bảng.
 */
export function errorCodeToStatusCode(code: AppErrorCode): number {
  return CODE_STATUS_MAP[code] ?? 400;
}

/**
 * Lấy HTTP status từ AppError.
 * Ưu tiên: error.statusCode (explicit) → mapping từ code → 400.
 */
export function appErrorToStatusCode(error: AppError): number {
  if (error.statusCode != null) return error.statusCode;
  return errorCodeToStatusCode(error.code);
}

// ============ Response helpers ============

/** Body trả về khi error (dùng chung Lambda + Next.js). */
export interface HttpErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/** Response chuẩn cho HTTP error. */
export interface HttpErrorResponse {
  statusCode: number;
  body: HttpErrorBody;
}

/**
 * Chuyển AppError → HttpErrorResponse.
 * Dùng trong cả Lambda handler và Next.js API route.
 *
 * @example
 * // Lambda
 * const resp = toHttpErrorResponse(appError);
 * return { statusCode: resp.statusCode, body: JSON.stringify(resp.body) };
 *
 * // Next.js
 * const resp = toHttpErrorResponse(appError);
 * return NextResponse.json(resp.body, { status: resp.statusCode });
 */
export function toHttpErrorResponse(error: AppError): HttpErrorResponse {
  const statusCode = appErrorToStatusCode(error);
  const body: HttpErrorBody = {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details !== undefined && { details: error.details }),
    },
  };
  return { statusCode, body };
}

/**
 * App error codes – hệ thống mã lỗi dùng chung toàn project.
 *
 * Predefined codes cho các trường hợp phổ biến.
 * Mở rộng: throw new AppException("PAYMENT_FAILED", "...", { statusCode: 422 })
 * Client check lỗi dựa vào field `code` trong response.
 */

// ============ Predefined error codes ============

export const APP_ERROR_CODES = {
  // ---- Request / Validation ----
  VALIDATION: "VALIDATION",
  BAD_REQUEST: "BAD_REQUEST",

  // ---- Auth ----
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",

  // ---- Resource ----
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  GONE: "GONE",

  // ---- Rate / Limit ----
  TOO_MANY_REQUESTS: "TOO_MANY_REQUESTS",

  // ---- Server ----
  INTERNAL: "INTERNAL",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  TIMEOUT: "TIMEOUT",

  // ---- Business (mở rộng theo domain) ----
  INSUFFICIENT_BALANCE: "INSUFFICIENT_BALANCE",
  ACCOUNT_DISABLED: "ACCOUNT_DISABLED",
  ACCOUNT_SUSPENDED: "ACCOUNT_SUSPENDED",
  ACCOUNT_READ_ONLY: "ACCOUNT_READ_ONLY",
} as const;

// ============ Types ============

/**
 * Error code – string để mở rộng không giới hạn.
 * Predefined codes có autocomplete qua APP_ERROR_CODES.
 */
export type AppErrorCode = string;

/**
 * Error object chuẩn – dùng trong response, log, transport.
 * statusCode: HTTP status (optional – nếu không set, dùng mapping mặc định).
 */
export interface AppError {
  code: AppErrorCode;
  message: string;
  details?: unknown;
  /** HTTP status code. Nếu set → ưu tiên dùng; nếu không → mapping từ code. */
  statusCode?: number;
}

/** Result pattern: success + data hoặc error. */
export type AppResult<T> =
  | { success: true; data: T }
  | { success: false; error: AppError };

/** Type guard: kiểm tra object có phải AppError hay không. */
export function isAppError(err: unknown): err is AppError {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    "message" in err
  );
}

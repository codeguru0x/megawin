/**
 * AppException – exception chuẩn cho toàn hệ thống.
 *
 * Throw ở bất cứ đâu: use case, repository, domain service, infra adapter.
 *
 * @example
 * // Predefined code (statusCode tự map)
 * throw AppException.notFound("User not found");
 * throw AppException.conflict("Username taken", { username });
 *
 * // Custom code + explicit statusCode
 * throw new AppException("INSUFFICIENT_BALANCE", "Not enough credits", {
 *   statusCode: 422,
 *   details: { balance: 100, required: 500 },
 * });
 *
 * // Custom code (default 500 nếu không set statusCode)
 * throw new AppException("TENANT_SUSPENDED", "Tenant is suspended");
 */

import { APP_ERROR_CODES, type AppError, type AppErrorCode } from "./error-codes";

export interface AppExceptionOptions {
  details?: unknown;
  /** HTTP status code. Nếu không set → mapping từ error code hoặc default 500. */
  statusCode?: number;
}

export class AppException extends Error {
  readonly code: AppErrorCode;
  readonly details?: unknown;
  readonly statusCode?: number;

  constructor(code: AppErrorCode, message: string, options?: AppExceptionOptions) {
    super(message);
    this.name = "AppException";
    this.code = code;
    this.details = options?.details;
    this.statusCode = options?.statusCode;
  }

  /** Chuyển thành AppError object (dùng trong response / serialize). */
  toError(): AppError {
    const error: AppError = { code: this.code, message: this.message };
    if (this.details !== undefined) error.details = this.details;
    if (this.statusCode !== undefined) error.statusCode = this.statusCode;
    return error;
  }

  // ============ Static helpers (predefined codes + auto statusCode) ============

  static businessRuleViolation(message: string, details?: unknown): AppException {
    return new AppException(APP_ERROR_CODES.BUSINESS_RULE_VIOLATION, message, {
      details,
      statusCode: 400,
    });
  }

  static validation(message: string, details?: unknown): AppException {
    return new AppException(APP_ERROR_CODES.VALIDATION, message, {
      details,
      statusCode: 400,
    });
  }

  static badRequest(message: string, details?: unknown): AppException {
    return new AppException(APP_ERROR_CODES.BAD_REQUEST, message, {
      details,
      statusCode: 400,
    });
  }

  static unauthorized(message: string, details?: unknown): AppException {
    return new AppException(APP_ERROR_CODES.UNAUTHORIZED, message, {
      details,
      statusCode: 401,
    });
  }

  static forbidden(message: string, details?: unknown): AppException {
    return new AppException(APP_ERROR_CODES.FORBIDDEN, message, {
      details,
      statusCode: 403,
    });
  }

  static notFound(message: string, details?: unknown): AppException {
    return new AppException(APP_ERROR_CODES.NOT_FOUND, message, {
      details,
      statusCode: 404,
    });
  }

  static conflict(message: string, details?: unknown): AppException {
    return new AppException(APP_ERROR_CODES.CONFLICT, message, {
      details,
      statusCode: 409,
    });
  }

  static gone(message: string, details?: unknown): AppException {
    return new AppException(APP_ERROR_CODES.GONE, message, {
      details,
      statusCode: 410,
    });
  }

  static tooManyRequests(message: string, details?: unknown): AppException {
    return new AppException(APP_ERROR_CODES.TOO_MANY_REQUESTS, message, {
      details,
      statusCode: 429,
    });
  }

  static internal(message: string, details?: unknown): AppException {
    return new AppException(APP_ERROR_CODES.INTERNAL, message, {
      details,
      statusCode: 500,
    });
  }

  static serviceUnavailable(message: string, details?: unknown): AppException {
    return new AppException(APP_ERROR_CODES.SERVICE_UNAVAILABLE, message, {
      details,
      statusCode: 503,
    });
  }

  static timeout(message: string, details?: unknown): AppException {
    return new AppException(APP_ERROR_CODES.TIMEOUT, message, {
      details,
      statusCode: 504,
    });
  }

  static error(code: AppErrorCode, message: string, details?: unknown): AppException {
    return new AppException(code, message, {
      details,
      statusCode: 400,
    });
  }
}

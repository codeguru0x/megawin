/**
 * Base use case – shared standard for the project.
 *
 * Error types (AppError, AppException, APP_ERROR_CODES) sống ở @megawin/shared/errors.
 * File này re-export + định nghĩa BaseUseCase dùng chung cho use case layer.
 *
 * Throw AppException ở bất cứ đâu trong execute/validate
 * → tự động bắt và trả về đúng error code + message cho client.
 */

// ============ Re-export từ @megawin/shared/errors ============
// Giữ re-export để các consumer hiện tại không cần đổi import path.

export {
  APP_ERROR_CODES,
  type AppError,
  type AppErrorCode,
  AppException,
  type AppResult,
  isAppError,
} from "@megawin/shared/errors";

// ============ Legacy aliases (backward compat) ============

import {
  APP_ERROR_CODES,
  type AppError,
  type AppErrorCode,
  AppException,
  type AppResult,
  isAppError,
} from "@megawin/shared/errors";

/** @deprecated Dùng APP_ERROR_CODES */
export const USE_CASE_ERROR_CODES = APP_ERROR_CODES;
/** @deprecated Dùng AppErrorCode */
export type UseCaseErrorCode = AppErrorCode;
/** @deprecated Dùng AppError */
export type UseCaseError = AppError;
/** @deprecated Dùng AppResult */
export type UseCaseResult<T> = AppResult<T>;
/** @deprecated Dùng isAppError */
export const isUseCaseError = isAppError;
/** @deprecated Dùng AppException */
export const UseCaseException = AppException;

// ============ Base Use Case ============

/**
 * Base use case – nhận DTO đã parse, validate nghiệp vụ, execute business logic.
 *
 * @template I - Input DTO (đã được handler/middleware parse + validate format).
 * @template O - Output DTO.
 */
export abstract class BaseUseCase<I, O> {
  protected validate(_input: I): void | AppError {
    return undefined;
  }

  protected abstract execute(input: I): Promise<O>;

  async run(input: I): Promise<AppResult<O>> {
    try {
      const validationError = this.validate(input);
      if (validationError) {
        return { success: false, error: validationError };
      }
      const output = await this.execute(input);
      return { success: true, data: output };
    } catch (err) {
      return this.handleError(err);
    }
  }

  protected handleError(err: unknown): AppResult<O> {
    if (err instanceof AppException) {
      return { success: false, error: err.toError() };
    }
    if (isAppError(err)) {
      return { success: false, error: err as AppError };
    }
    return {
      success: false,
      error: {
        code: APP_ERROR_CODES.INTERNAL,
        message: err instanceof Error ? err.message : "Unknown error",
        details: err,
      },
    };
  }
}

/**
 * Middy onError: map lỗi (HTTP error, AppException, AppError) thành API Gateway response.
 * Response format thống nhất: { success: false, error: { code, message, details? } }
 */

import {
  type AppError,
  isAppError,
  AppException,
  APP_ERROR_CODES,
  appErrorToStatusCode,
} from "@megawin/shared/errors";
import type { ApiErrorResponse } from "@megawin/shared/api-types";

const JSON_HEADERS = { "Content-Type": "application/json" };

interface HttpLikeError {
  statusCode?: number;
  message?: string;
}

function toErrorBody(
  code: string,
  message: string,
  details?: unknown,
): ApiErrorResponse {
  return {
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined && { details }),
    },
  };
}

export function httpErrorHandlerUseCaseFormat() {
  return {
    onError: (request: { error: unknown; response?: unknown }) => {
      const err = request.error;
      let statusCode = 500;
      let body: ApiErrorResponse;

      if (err instanceof AppException) {
        const appError = err.toError();
        statusCode = appErrorToStatusCode(appError);
        body = toErrorBody(appError.code, appError.message, appError.details);
      } else if (isAppError(err)) {
        statusCode = appErrorToStatusCode(err);
        body = toErrorBody(
          (err as AppError).code,
          (err as AppError).message,
          (err as AppError).details,
        );
      } else if (err && typeof err === "object" && "statusCode" in err) {
        const httpErr = err as HttpLikeError;
        statusCode = Number(httpErr.statusCode) || 500;
        body = toErrorBody(
          statusCode >= 500
            ? APP_ERROR_CODES.INTERNAL
            : APP_ERROR_CODES.BAD_REQUEST,
          httpErr.message ?? "Error",
        );
      } else {
        body = toErrorBody(
          APP_ERROR_CODES.INTERNAL,
          err instanceof Error ? err.message : "Unknown error",
        );
      }

      request.response = {
        statusCode,
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
      };
    },
  };
}

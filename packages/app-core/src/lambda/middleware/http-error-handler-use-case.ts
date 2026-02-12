/**
 * Middy onError: map lỗi (HTTP error, AppException, AppError) thành API Gateway response.
 * Sử dụng appErrorToStatusCode từ @megawin/shared/errors – hỗ trợ custom statusCode trên error.
 */

import {
  type AppError,
  isAppError,
  AppException,
  APP_ERROR_CODES,
  appErrorToStatusCode,
} from "@megawin/shared/errors";

const JSON_HEADERS = { "Content-Type": "application/json" };

interface HttpLikeError {
  statusCode?: number;
  message?: string;
}

export function httpErrorHandlerUseCaseFormat() {
  return {
    onError: (request: { error: unknown; response?: unknown }) => {
      const err = request.error;
      let statusCode = 500;
      let body: { error: AppError };

      if (err instanceof AppException) {
        const appError = err.toError();
        statusCode = appErrorToStatusCode(appError);
        body = { error: appError };
      } else if (isAppError(err)) {
        statusCode = appErrorToStatusCode(err);
        body = { error: err };
      } else if (err && typeof err === "object" && "statusCode" in err) {
        const httpErr = err as HttpLikeError;
        statusCode = Number(httpErr.statusCode) || 500;
        body = {
          error: {
            code:
              statusCode >= 500
                ? APP_ERROR_CODES.INTERNAL
                : APP_ERROR_CODES.BAD_REQUEST,
            message: httpErr.message ?? "Error",
            details: err,
          },
        };
      } else {
        body = {
          error: {
            code: APP_ERROR_CODES.INTERNAL,
            message: err instanceof Error ? err.message : "Unknown error",
            details: err,
          },
        };
      }

      request.response = {
        statusCode,
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
      };
    },
  };
}

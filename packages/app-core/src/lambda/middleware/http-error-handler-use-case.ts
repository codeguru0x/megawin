/**
 * Middy onError: map lỗi (HTTP error, AppException, AppError) thành API Gateway response.
 * Response format thống nhất: { success: false, error: { code, message, details? } }
 */

import type { ApiErrorResponse } from "@megawin/shared/api-types";
import { APP_ERROR_CODES, type AppError, AppException, appErrorToStatusCode, isAppError } from "@megawin/shared/errors";
import { logError } from "@megawin/shared/utils";

const JSON_HEADERS = { "Content-Type": "application/json" };

interface HttpLikeError {
  statusCode?: number;
  message?: string;
}

function toErrorBody(code: string, message: string, details?: unknown): ApiErrorResponse {
  return {
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined && { details }),
    },
  };
}

const UNEXPECTED_ERROR_MESSAGE = "Có lỗi xảy ra trên hệ thống, hãy liên hệ quản lý để được trợ giúp.";

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
        body = toErrorBody((err as AppError).code, (err as AppError).message, (err as AppError).details);
      } else if (err && typeof err === "object" && "statusCode" in err) {
        const httpErr = err as HttpLikeError;
        statusCode = Number(httpErr.statusCode) || 500;
        body = toErrorBody(
          statusCode >= 500 ? APP_ERROR_CODES.INTERNAL : APP_ERROR_CODES.BAD_REQUEST,
          statusCode >= 500 ? UNEXPECTED_ERROR_MESSAGE : (httpErr.message ?? "Error"),
        );
        if (statusCode >= 500) {
          logError("LambdaHttpErrorHandler", err);
        }
      } else {
        logError("LambdaHttpErrorHandler", err);
        body = toErrorBody(APP_ERROR_CODES.INTERNAL, UNEXPECTED_ERROR_MESSAGE);
      }

      request.response = {
        statusCode,
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
      };
    },
  };
}

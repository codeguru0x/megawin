/**
 * Middy onError: map lỗi (HTTP error, UseCaseError) thành API Gateway response.
 * Dùng cùng httpErrorHandler của Middy hoặc thay thế để format body JSON thống nhất.
 */

import {
  type UseCaseError,
  isUseCaseError,
  USE_CASE_ERROR_CODES,
} from "#application/usecase/usecase-base";
import { useCaseErrorToStatusCode } from "#lambda/http/usecase-api-gateway";

const JSON_HEADERS = { "Content-Type": "application/json" };

/** Error có statusCode (vd từ http-errors) hoặc UseCaseError. */
type HttpLikeError = Error & {
  statusCode?: number;
  expose?: boolean;
};

/**
 * onError middleware: trả về response body dạng JSON { error: { code, message, details? } }
 * và statusCode từ useCaseErrorToStatusCode (nếu là UseCaseError) hoặc error.statusCode (mặc định 500).
 */
export function httpErrorHandlerUseCaseFormat() {
  return {
    onError: (request: { error: unknown; response?: unknown }) => {
      const err = request.error;
      let statusCode = 500;
      let body: { error: UseCaseError } = {
        error: {
          code: USE_CASE_ERROR_CODES.INTERNAL,
          message: err instanceof Error ? err.message : "Unknown error",
          details: err,
        },
      };

      if (isUseCaseError(err)) {
        statusCode = useCaseErrorToStatusCode(err.code);
        body = { error: err };
      } else if (err && typeof err === "object" && "statusCode" in err) {
        const httpErr = err as HttpLikeError;
        statusCode = Number(httpErr.statusCode) || 500;
        body = {
          error: {
            code:
              statusCode >= 500
                ? USE_CASE_ERROR_CODES.INTERNAL
                : USE_CASE_ERROR_CODES.VALIDATION,
            message: httpErr.message ?? "Error",
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

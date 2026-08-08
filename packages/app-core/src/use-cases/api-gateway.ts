/**
 * Use case cho API Gateway.
 *
 * ApiGatewayUseCase.run(dto) trả thẳng ApiGatewayResponse.
 * Handler chỉ cần: return useCase.run(dto)
 *
 * Response format thống nhất với Next.js API routes:
 * - Success: { success: true, data: T, meta?: ... }
 * - Error:   { success: false, error: { code, message, details? } }
 */

import {
  type AppError,
  type AppResult,
  AppException,
  isAppError,
  APP_ERROR_CODES,
  appErrorToStatusCode,
} from "@megawin/shared/errors";
import type { ApiSuccessResponse, ApiErrorResponse, ApiResponseMeta } from "@megawin/shared/api-types";

// ============ Re-export cho backward compat ============

export { errorCodeToStatusCode, appErrorToStatusCode } from "@megawin/shared/errors";

/** @deprecated Dùng errorCodeToStatusCode từ @megawin/shared/errors */
export { errorCodeToStatusCode as useCaseErrorToStatusCode } from "@megawin/shared/errors";

// ============ Types ============

/** Response chuẩn API Gateway (Lambda proxy). */
export interface ApiGatewayResponse {
  statusCode: number;
  body: string;
  headers?: Record<string, string>;
}

// ============ Helpers ============

/** Chuyển AppResult<O> thành ApiGatewayResponse (format thống nhất với Next.js). */
export function toApiGatewayResponse<O>(
  result: AppResult<O>,
  options?: {
    successStatus?: number;
    headers?: Record<string, string>;
    meta?: ApiResponseMeta;
  },
): ApiGatewayResponse {
  const defaultHeaders = { "Content-Type": "application/json" };
  const headers = { ...defaultHeaders, ...options?.headers };

  if (result.success) {
    const body: ApiSuccessResponse<O> = { success: true, data: result.data };
    if (options?.meta) body.meta = options.meta;
    return {
      statusCode: options?.successStatus ?? 200,
      body: JSON.stringify(body),
      headers,
    };
  }

  const statusCode = appErrorToStatusCode(result.error);
  const body: ApiErrorResponse = {
    success: false,
    error: {
      code: result.error.code,
      message: result.error.message,
      ...(result.error.details !== undefined && {
        details: result.error.details,
      }),
    },
  };
  return { statusCode, body: JSON.stringify(body), headers };
}

// ============ ApiGatewayUseCase ============

/**
 * Use case cho API Gateway – run() trả thẳng ApiGatewayResponse.
 *
 * @example
 * class CreateUserUseCase extends ApiGatewayUseCase<CreateUserDto, UserOutput> {
 *   protected async execute(input: CreateUserDto) {
 *     throw AppException.conflict("Username taken");
 *   }
 * }
 *
 * // Handler:
 * return useCase.run(dto);
 */
export abstract class ApiGatewayUseCase<I, O> {
  protected validate(_input: I): void | AppError {
    return undefined;
  }

  protected abstract execute(input: I): Promise<O>;

  async run(input: I): Promise<ApiGatewayResponse> {
    try {
      const validationError = this.validate(input);
      if (validationError) {
        return toApiGatewayResponse<O>({
          success: false,
          error: validationError,
        });
      }
      const output = await this.execute(input);
      return toApiGatewayResponse<O>({ success: true, data: output });
    } catch (err) {
      if (err instanceof AppException) {
        return toApiGatewayResponse<O>({
          success: false,
          error: err.toError(),
        });
      }
      if (isAppError(err)) {
        return toApiGatewayResponse<O>({
          success: false,
          error: err as AppError,
        });
      }
      return toApiGatewayResponse<O>({
        success: false,
        error: {
          code: APP_ERROR_CODES.INTERNAL,
          message: err instanceof Error ? err.message : "Unknown error",
        },
      });
    }
  }
}

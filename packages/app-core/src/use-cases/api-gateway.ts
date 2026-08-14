/**
 * API Gateway response — type + converter tường minh cho Lambda proxy integration.
 *
 * KHÔNG còn base class ở file này. `ApiGatewayUseCase` đã bị xoá sau Phase 4 (mọi use-case
 * chuyển sang `UseCase` trả raw output, envelope do `successEnvelopeMiddleware` bọc ở biên —
 * xem `.cursor/rules/app-use-case-layering.mdc` §3.3).
 *
 * Hai thứ còn lại đều CÓ consumer thật, không phải legacy:
 *
 * - `ApiGatewayResponse` — `successEnvelopeMiddleware` dùng làm type cho guard
 *   `isApiGatewayResponse()`, để nhận biết handler đã tự trả response tường minh và KHÔNG
 *   bọc envelope lần hai.
 * - `toApiGatewayResponse()` — **escape hatch**: handler cần status/headers khác chuẩn
 *   (vd `204 No Content`, `Location` header) thì tự build response và trả tường minh;
 *   middleware thấy đúng shape sẽ cho đi thẳng.
 *
 * Response format thống nhất với Next.js API routes:
 * - Success: `{ success: true, data: T, meta?: ... }`
 * - Error:   `{ success: false, error: { code, message, details? } }`
 */

import type { ApiErrorResponse, ApiResponseMeta, ApiSuccessResponse } from "@megawin/shared/api-types";
import { type AppResult, appErrorToStatusCode } from "@megawin/shared/errors";

// ============ Types ============

/** Response chuẩn API Gateway (Lambda proxy). */
export interface ApiGatewayResponse {
  statusCode: number;
  body: string;
  headers?: Record<string, string>;
}

// ============ Helpers ============

/**
 * Chuyển `AppResult<O>` thành `ApiGatewayResponse` (format thống nhất với Next.js).
 *
 * Chỉ dùng khi cần response TƯỜNG MINH khác chuẩn — đường thường là `return useCase.run(dto)`
 * để middleware tự bọc `{ success: true, data }` status 200.
 *
 * @param options.successStatus - Status cho nhánh success (default 200). Nhánh error luôn map
 *   từ `error.code` qua `appErrorToStatusCode`, KHÔNG nhận override.
 */
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
    if (options?.meta) {
      body.meta = options.meta;
    }
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

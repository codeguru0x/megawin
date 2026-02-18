/**
 * Server-side response builders cho Next.js API routes.
 *
 * Tất cả responses đều theo chuẩn ApiResponse format.
 * HTTP status codes tuân thủ RFC 9110.
 */

import { NextResponse } from "next/server";
import {
  type AppError,
  type AppResult,
  AppException,
  isAppError,
  APP_ERROR_CODES,
  appErrorToStatusCode,
} from "@megawin/shared/errors";
import type {
  ApiErrorDetail,
  ApiErrorResponse,
  ApiResponseMeta,
  ApiSuccessResponse,
} from "../types";

// ============ Success ============

/**
 * Trả success response chuẩn.
 *
 * @example
 * return apiSuccess(users, { meta: { total: 100, page: 1, pageSize: 20 } });
 * return apiSuccess(user, { status: 201 });
 */
export function apiSuccess<T>(
  data: T,
  options?: {
    status?: number;
    headers?: Record<string, string>;
    meta?: ApiResponseMeta;
  }
): NextResponse<ApiSuccessResponse<T>> {
  const body: ApiSuccessResponse<T> = { success: true, data };
  if (options?.meta) body.meta = options.meta;

  return NextResponse.json(body, {
    status: options?.status ?? 200,
    headers: options?.headers,
  });
}

// ============ Error ============

/**
 * Trả error response chuẩn.
 *
 * @example
 * return apiError(400, { code: "VALIDATION", message: "Invalid email" });
 * return apiError(404, { code: "NOT_FOUND", message: "User not found" });
 */
export function apiError(
  status: number,
  error: ApiErrorDetail,
  headers?: Record<string, string>
): NextResponse<ApiErrorResponse> {
  const body: ApiErrorResponse = {
    success: false,
    error: {
      code: error.code,
      message: error.message,
      ...(error.details !== undefined && { details: error.details }),
      ...(error.requestId && { requestId: error.requestId }),
    },
  };
  return NextResponse.json(body, { status, headers });
}

// ============ AppError → ApiResponse ============

/**
 * Chuyển AppError từ shared error system sang NextResponse chuẩn.
 */
export function appErrorToApiResponse(
  error: AppError
): NextResponse<ApiErrorResponse> {
  const status = appErrorToStatusCode(error);
  return apiError(status, {
    code: error.code,
    message: error.message,
    details: error.details,
  });
}

// ============ AppResult → ApiResponse ============

/**
 * Chuyển AppResult<T> thành NextResponse theo chuẩn ApiResponse.
 *
 * @example
 * const result = await useCase.run(input);
 * return appResultToApiResponse(result, { successStatus: 201 });
 */
export function appResultToApiResponse<T>(
  result: AppResult<T>,
  options?: {
    successStatus?: number;
    headers?: Record<string, string>;
    meta?: ApiResponseMeta;
  }
): NextResponse<ApiSuccessResponse<T> | ApiErrorResponse> {
  if (result.success) {
    return apiSuccess(result.data, {
      status: options?.successStatus ?? 200,
      headers: options?.headers,
      meta: options?.meta,
    });
  }
  return appErrorToApiResponse(result.error);
}

// ============ Catch-all Error Handler ============

/**
 * Bắt mọi loại error và trả NextResponse chuẩn.
 * Dùng trong catch block của route handler.
 */
export function catchToApiResponse(
  err: unknown
): NextResponse<ApiErrorResponse> {
  if (err instanceof AppException) {
    return appErrorToApiResponse(err.toError());
  }
  if (isAppError(err)) {
    return appErrorToApiResponse(err as AppError);
  }
  const message = err instanceof Error ? err.message : "Internal server error";
  return apiError(500, {
    code: APP_ERROR_CODES.INTERNAL,
    message,
  });
}

// ============ Validation Error Shortcut ============

export function validationError(
  message: string,
  details?: unknown
): NextResponse<ApiErrorResponse> {
  return apiError(400, {
    code: APP_ERROR_CODES.VALIDATION,
    message,
    details,
  });
}

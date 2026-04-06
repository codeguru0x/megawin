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
import { logError } from "@megawin/shared/utils";

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
  },
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
  headers?: Record<string, string>,
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
export function appErrorToApiResponse(error: AppError): NextResponse<ApiErrorResponse> {
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
  },
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
 *
 * AppException / AppError → trả message gốc (đã kiểm soát nội dung).
 * Unexpected error (AWS SDK, DB, runtime…) → log chi tiết cho audit,
 * chỉ trả message chung "Internal server error" — không leak thông tin nhạy cảm.
 */
export function catchToApiResponse(err: unknown): NextResponse<ApiErrorResponse> {
  if (err instanceof AppException) {
    return appErrorToApiResponse(err.toError());
  }
  if (isAppError(err)) {
    return appErrorToApiResponse(err as AppError);
  }

  // Unexpected error — log đầy đủ cho audit, KHÔNG trả message gốc cho client.
  logError("[API] Unhandled error:", err);

  return apiError(500, {
    code: APP_ERROR_CODES.INTERNAL,
    message: "Lỗi xảy ra trên hệ thống, vui lòng liên hệ quản trị viên.",
  });
}

// ============ Validation Error Shortcut ============

/**
 * Format ZodError issues thành mảng { field, message }.
 * path: (string | number)[] → "draws[0].drawTime"
 * path: []                  → field: "" (top-level error)
 */
function formatZodIssues(error: import("zod").ZodError): Array<{ field: string; message: string }> {
  return error.issues.map((issue) => ({
    field: issue.path.reduce<string>((acc, segment, i) => {
      if (typeof segment === "number") return `${acc}[${segment}]`;
      return i === 0 ? String(segment) : `${acc}.${String(segment)}`;
    }, ""),
    message: issue.message,
  }));
}

export function validationError(
  message: string,
  details?: unknown,
): NextResponse<ApiErrorResponse> {
  let formattedDetails = details;
  // Nếu details là ZodError → format thành mảng { field, message } có full path
  if (details && typeof details === "object" && "issues" in details) {
    formattedDetails = { errors: formatZodIssues(details as import("zod").ZodError) };
  }
  return apiError(400, {
    code: APP_ERROR_CODES.VALIDATION,
    message,
    details: formattedDetails,
  });
}

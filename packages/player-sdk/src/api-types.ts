/**
 * Standardized API response format.
 *
 * Mọi API endpoint đều trả về format thống nhất:
 * - Success: { success: true, data: T, meta?: ... }
 * - Error:   { success: false, error: { code, message, details? } }
 */

// ============ Success Response ============

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  meta?: ApiResponseMeta;
}

// Mọi endpoint hiện có nhúng cursor pagination (`nextCursor`, `size`) trực tiếp vào `data`,
// không populate `meta`. Field này giữ lại cho tương lai (page-based pagination) — hiện tại
// luôn `undefined` trên response thật.
export interface ApiResponseMeta {
  total?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
  [key: string]: unknown;
}

// ============ Error Response ============

export interface ApiErrorDetail {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiErrorResponse {
  success: false;
  error: ApiErrorDetail;
}

// ============ Union ============

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

// ============ Type Guards ============

export function isApiSuccess<T>(response: ApiResponse<T>): response is ApiSuccessResponse<T> {
  return response.success === true;
}

export function isApiError<T>(response: ApiResponse<T>): response is ApiErrorResponse {
  return response.success === false;
}

// ============ Client-side Error Class ============

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, error: ApiErrorDetail) {
    super(error.message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = error.code;
    this.details = error.details;
  }

  toJSON(): ApiErrorResponse & { status: number } {
    return {
      success: false,
      status: this.status,
      error: {
        code: this.code,
        message: this.message,
        ...(this.details !== undefined && { details: this.details }),
      },
    };
  }
}

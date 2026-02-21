/**
 * Standardized API response format – dùng chung cho cả Next.js và Lambda.
 *
 * Mọi API endpoint đều trả về format thống nhất:
 * - Success: { success: true, data: T, meta?: ... }
 * - Error:   { success: false, error: { code, message, details?, requestId? } }
 *
 * Client luôn check `success` trước, sau đó truy cập `data` hoặc `error`.
 * HTTP status code vẫn set đúng chuẩn (200, 201, 400, 401, ...).
 */

// ============ Success Response ============

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  meta?: ApiResponseMeta;
}

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
  requestId?: string;
}

export interface ApiErrorResponse {
  success: false;
  error: ApiErrorDetail;
}

// ============ Union ============

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

// ============ Type Guards ============

export function isApiSuccess<T>(
  response: ApiResponse<T>,
): response is ApiSuccessResponse<T> {
  return response.success === true;
}

export function isApiError<T>(
  response: ApiResponse<T>,
): response is ApiErrorResponse {
  return response.success === false;
}

// ============ Client-side Error Class ============

/**
 * Error class dùng ở client khi API trả lỗi.
 * Throw/catch được, chứa đầy đủ thông tin error response.
 */
export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor(status: number, error: ApiErrorDetail) {
    super(error.message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = error.code;
    this.details = error.details;
    this.requestId = error.requestId;
  }

  toJSON(): ApiErrorResponse & { status: number } {
    return {
      success: false,
      status: this.status,
      error: {
        code: this.code,
        message: this.message,
        ...(this.details !== undefined && { details: this.details }),
        ...(this.requestId && { requestId: this.requestId }),
      },
    };
  }
}

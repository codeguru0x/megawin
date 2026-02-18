/**
 * Standardized API response format cho Next.js API routes.
 *
 * Mọi API route đều trả về format thống nhất:
 * - Success: { success: true, data: T, meta?: ... }
 * - Error:   { success: false, error: { code, message, details?, requestId? } }
 *
 * Client luôn check `success` trước, sau đó truy cập `data` hoặc `error`.
 * HTTP status code vẫn set đúng chuẩn (200, 201, 400, 401, ...).
 *
 * Tham khảo: Stripe API, GitHub API, Google Cloud API error model.
 */

// ============ Success Response ============

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  meta?: ApiResponseMeta;
}

export interface ApiResponseMeta {
  /** Pagination – tổng items (server trả về nếu có). */
  total?: number;
  /** Pagination – trang hiện tại. */
  page?: number;
  /** Pagination – items per page. */
  pageSize?: number;
  /** Pagination – tổng số trang. */
  totalPages?: number;
  /** Extensible metadata. */
  [key: string]: unknown;
}

// ============ Error Response ============

export interface ApiErrorDetail {
  /** Machine-readable error code (e.g. VALIDATION, NOT_FOUND, UNAUTHORIZED). */
  code: string;
  /** Human-readable error message. */
  message: string;
  /**
   * Structured error details.
   * - Validation: field-level errors `{ fieldErrors: {...}, formErrors: [...] }`
   * - Business: domain-specific context
   */
  details?: unknown;
  /** Request ID for tracing / support tickets. */
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
  response: ApiResponse<T>
): response is ApiSuccessResponse<T> {
  return response.success === true;
}

export function isApiError<T>(
  response: ApiResponse<T>
): response is ApiErrorResponse {
  return response.success === false;
}

// ============ Client-side Error Class ============

/**
 * Error class cho client-side khi API trả về lỗi.
 * Throw/catch được, chứa đầy đủ thông tin error response.
 *
 * @example
 * try {
 *   const data = await api.get("/users/123");
 * } catch (err) {
 *   if (err instanceof ApiClientError) {
 *     console.log(err.status);  // 404
 *     console.log(err.code);    // "NOT_FOUND"
 *     console.log(err.details); // { ... }
 *   }
 * }
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

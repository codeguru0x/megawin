/**
 * Server-side response builders cho Next.js API routes.
 *
 * Mọi response theo chuẩn `ApiResponse`: `{ success: true, data }` hoặc `{ success: false, error }`.
 * HTTP status tuân thủ RFC 9110.
 *
 * ## Đường đi mặc định — route KHÔNG cần gọi hàm nào ở đây
 *
 * Sau redesign use-case pattern (14/08/2026), `ApiRouteBuilder.handler()` tự bọc envelope ở 2 phía:
 * - success: raw value từ route → {@link apiSuccess} (status 200)
 * - error:   exception thoát ra → {@link catchToApiResponse}
 *
 * Nên route chỉ viết `return useCase.run(query)` và `throw AppException` khi lỗi. Các hàm export
 * ở file này là **escape hatch** cho trường hợp cần điều khiển response tay (header riêng như ETag,
 * status không suy được từ error code) — dùng ít, có lý do rõ ràng.
 */

import { NextResponse } from "next/server";

import { APP_ERROR_CODES, type AppError, AppException, appErrorToStatusCode, isAppError } from "@megawin/shared/errors";
import { logError } from "@megawin/shared/utils";
import { formatZodIssues, isZodErrorLike } from "@megawin/shared/validation";

import type { ApiErrorDetail, ApiErrorResponse, ApiResponseMeta, ApiSuccessResponse } from "../types";

// ============ Success ============

/**
 * Trả success response chuẩn `{ success: true, data }`.
 *
 * **Thường KHÔNG cần gọi tay** — `ApiRouteBuilder.handler()` tự bọc raw value trả về từ route
 * bằng hàm này (status 200). Chỉ gọi tường minh khi cần `headers` hoặc `meta` riêng.
 *
 * `status` là escape hatch — mọi success trong hệ thống thống nhất **200** (quyết định 14/08/2026,
 * đã bỏ toàn bộ 201; xem `redesign_use-case_facade_pattern` plan). Chỉ đổi khi có lý do
 * protocol thật (vd 202 cho job async), KHÔNG dùng 201 lại cho endpoint tạo mới.
 *
 * @example
 * // Cần header riêng (pattern đang dùng ở các route operations/snapshot):
 * return apiSuccess(data, { headers: { ETag: etag } });
 *
 * // Kèm metadata phân trang:
 * return apiSuccess(users, { meta: { total: 100, page: 1, pageSize: 20 } });
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

  if (options?.meta) {
    body.meta = options.meta;
  }

  return NextResponse.json(body, {
    status: options?.status ?? 200,
    headers: options?.headers,
  });
}

// ============ Error ============

/**
 * Trả error response chuẩn `{ success: false, error }` với status tự chỉ định.
 *
 * **Ưu tiên `throw AppException` trong route/use-case** thay vì gọi hàm này — builder đã catch và
 * map sang status đúng qua {@link catchToApiResponse}. Hàm này chỉ dùng ở tầng builder
 * (`api-route.ts`: 401/403 auth) hoặc khi cần status không suy được từ error code.
 *
 * CẨN THẬN: `status` và `error.code` do caller tự khớp — không có gì đảm bảo chúng nhất quán
 * (truyền `403` kèm code `NOT_FOUND` vẫn compile). Khi đã có `AppError`, dùng
 * {@link appErrorToApiResponse} để status được suy tự động từ code.
 *
 * @example
 * return apiError(403, { code: APP_ERROR_CODES.FORBIDDEN, message: "Không có quyền truy cập." });
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
 * Chuyển `AppError` (shared error system) sang `NextResponse` — status suy TỰ ĐỘNG từ `error.code`
 * qua `appErrorToStatusCode`, nên không bao giờ lệch giữa status và code như `apiError` thủ công.
 *
 * Đây là đường đi của mọi lỗi có kiểm soát: `throw AppException` trong use-case → builder catch →
 * {@link catchToApiResponse} → hàm này.
 */
export function appErrorToApiResponse(error: AppError): NextResponse<ApiErrorResponse> {
  const status = appErrorToStatusCode(error);
  return apiError(status, {
    code: error.code,
    message: error.message,
    details: error.details,
  });
}

// ============ Catch-all Error Handler ============

/**
 * Bắt MỌI loại error và trả `NextResponse` chuẩn. Builder gọi hàm này trong catch block, nên route
 * chỉ cần `throw AppException` là đủ.
 *
 * Thứ tự 2 nhánh đầu là CÓ CHỦ ĐÍCH và không thể đảo:
 * `AppException` là `Error` thật, mà `isAppError` loại trừ `instanceof Error` — nên phải check
 * `AppException` TRƯỚC (nhánh 2 sẽ không bao giờ nhận nó). Nhánh `isAppError` phục vụ trường hợp
 * lỗi đã bị serialize/deserialize (qua boundary RSC, JSON) làm mất prototype `Error`.
 *
 * Lỗi có kiểm soát (`AppException`/`AppError`) → trả message gốc, status suy từ code.
 * Lỗi bất ngờ (AWS SDK, driver DB, runtime…) → log đầy đủ cho audit, client chỉ nhận message
 * chung 500 — KHÔNG leak stack/query/credential ra ngoài.
 */
export function catchToApiResponse(err: unknown): NextResponse<ApiErrorResponse> {
  if (err instanceof AppException) {
    return appErrorToApiResponse(err.toError());
  }
  if (isAppError(err)) {
    return appErrorToApiResponse(err);
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
 * Trả 400 VALIDATION. Nếu `details` là `ZodError` → tự format thành `{ errors: [{ field, message }] }`
 * để FE render bullet list theo từng field; loại khác giữ nguyên nguyên trạng.
 *
 * `formatZodIssues` / `isZodErrorLike` dùng chung từ `@megawin/shared/validation` — cùng bản mà
 * Lambda validator dùng, nên notation `field` (`draws[0].drawTime`) khớp tuyệt đối giữa hai
 * interface. Shape `details.errors[]` là hợp đồng với FE (`client/format-error-toast.ts`) và tenant
 * SDK: đổi ở đây là BREAKING cho cả hai.
 *
 * @example
 * const result = schema.safeParse(body);
 * if (!result.success) {
 *   return validationError("Validation failed", result.error);
 * }
 */
export function validationError(message: string, details?: unknown): NextResponse<ApiErrorResponse> {
  return apiError(400, {
    code: APP_ERROR_CODES.VALIDATION,
    message,
    details: isZodErrorLike(details) ? { errors: formatZodIssues(details) } : details,
  });
}

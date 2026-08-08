/**
 * API response types – re-exported từ @megawin/shared/api-types.
 * Backward compatible: import từ "@megawin/next" vẫn hoạt động.
 */

export type {
  ApiErrorDetail,
  ApiErrorResponse,
  ApiResponse,
  ApiResponseMeta,
  ApiSuccessResponse,
} from "@megawin/shared/api-types";
export { ApiClientError, isApiError, isApiSuccess } from "@megawin/shared/api-types";

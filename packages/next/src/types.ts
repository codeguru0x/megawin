/**
 * API response types – re-exported từ @megawin/shared/api-types.
 * Backward compatible: import từ "@megawin/next" vẫn hoạt động.
 */

export type {
  ApiSuccessResponse,
  ApiErrorResponse,
  ApiResponse,
  ApiErrorDetail,
  ApiResponseMeta,
} from "@megawin/shared/api-types";

export { ApiClientError, isApiSuccess, isApiError } from "@megawin/shared/api-types";

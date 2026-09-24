/**
 * Type dùng chung của Player SDK — envelope HTTP và trạng thái vé/entry.
 */

export {
  ApiClientError,
  type ApiErrorDetail,
  type ApiErrorResponse,
  type ApiResponse,
  type ApiResponseMeta,
  type ApiSuccessResponse,
  isApiError,
  isApiSuccess,
} from "./api-types";
export { EntryOutcome, EntryStatus, TicketStatus } from "./common-types";

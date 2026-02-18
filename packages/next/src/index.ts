/**
 * @megawin/next – Next.js App Router v16 utilities.
 *
 * Import paths:
 * - "@megawin/next"         → Shared types (ApiResponse, ApiClientError, etc.)
 * - "@megawin/next/server"  → Server-side (API route builder, response helpers, use case)
 * - "@megawin/next/client"  → Client-side (REST client, React Query helpers)
 */

// Shared types – safe for both server and client
export type {
  ApiResponse,
  ApiSuccessResponse,
  ApiErrorResponse,
  ApiErrorDetail,
  ApiResponseMeta,
} from "./types";

export { ApiClientError, isApiSuccess, isApiError } from "./types";

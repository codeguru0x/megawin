/**
 * REST client cho Next.js client-side – wrap @megawin/http-client.
 *
 * Thiết kế cho React Query: mỗi method trả Promise<T> (data đã unwrap),
 * throw ApiClientError khi API trả lỗi → React Query tự bắt vào error state.
 *
 * Authentication: better-auth session cookies được gửi tự động qua
 * credentials: "include". Không cần manually attach token/header.
 *
 * Base URL mặc định: `${NEXT_PUBLIC_SITE_URL}/api` hoặc `http://localhost:3000/api`.
 *
 * @example
 * const api = createApiClient();
 * const { data } = useQuery({ queryKey: ["users"], queryFn: () => api.get<User[]>("/users") });
 */

import { createHttpClient, type HttpClient, type HttpClientConfig, type RequestOptions } from "@megawin/http-client";

// ============ Config ============

export interface ApiClientConfig extends Omit<HttpClientConfig, "baseUrl"> {
  baseUrl?: string;
}

// ============ Factory ============

function getDefaultBaseUrl(): string {
  if (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_SITE_URL) {
    return `${process.env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "")}/api`;
  }
  return "http://localhost:3000/api";
}

/**
 * Tạo API client cho Next.js.
 * Cookies (better-auth session) được gửi tự động – không cần config thêm.
 */
export function createApiClient(config?: ApiClientConfig): HttpClient {
  return createHttpClient({
    ...config,
    baseUrl: config?.baseUrl ?? getDefaultBaseUrl(),
    credentials: config?.credentials ?? "include",
  });
}

/** Re-export types for convenience. */
export type { HttpClient as ApiClient, RequestOptions };

/** Default singleton – base URL: `${NEXT_PUBLIC_SITE_URL}/api`. */
export const apiClient = createApiClient();

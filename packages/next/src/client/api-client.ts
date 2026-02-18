/**
 * REST client cho Next.js client-side – dùng native fetch.
 *
 * Thiết kế cho React Query: mỗi method trả Promise<T> (data đã unwrap),
 * throw ApiClientError khi API trả lỗi → React Query tự bắt vào error state.
 *
 * Authentication: better-auth session cookies được gửi tự động qua
 * credentials: "include". Không cần manually attach token/header.
 *
 * Base URL mặc định: `${NEXT_PUBLIC_SITE_URL}/api` hoặc `http://localhost:3000/api`.
 * Path tự normalize: `"accounts/company"` và `"/accounts/company"` đều hoạt động.
 *
 * @example
 * // Tạo instance
 * const api = createApiClient();
 *
 * // React Query – không cần "/api" prefix
 * const { data } = useQuery({
 *   queryKey: ["users"],
 *   queryFn: () => api.get<User[]>("/users"),
 * });
 *
 * // Mutation
 * const mutation = useMutation({
 *   mutationFn: (body: CreateUserDto) => api.post<User>("/users", body),
 * });
 */

import type { ApiResponse, ApiErrorResponse } from "../types";
import { ApiClientError } from "../types";

// ============ Config ============

export interface ApiClientConfig {
  /**
   * Base URL cho requests.
   * Mặc định: `${NEXT_PUBLIC_SITE_URL}/api` hoặc `http://localhost:3000/api`.
   */
  baseUrl?: string;
  /** Default headers gửi kèm mọi request. */
  headers?: Record<string, string>;
  /** Request timeout (ms). Mặc định: 30000. */
  timeout?: number;
  /**
   * Credentials mode cho fetch.
   * Mặc định: "include" (gửi cookies – cần thiết cho better-auth session).
   * Set "same-origin" nếu chỉ call same-origin APIs.
   */
  credentials?: "include" | "same-origin" | "omit";
  /**
   * Hook chạy trước mỗi request – dùng để inject custom headers.
   * Return config mới hoặc mutate trực tiếp.
   */
  onRequest?: (config: RequestConfig) => RequestConfig | Promise<RequestConfig>;
  /**
   * Hook chạy khi nhận error response – dùng cho global error handling.
   * Có thể redirect, refresh token, show toast, etc.
   */
  onError?: (error: ApiClientError) => void | Promise<void>;
}

export interface RequestConfig {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: unknown;
  signal?: AbortSignal;
}

export interface RequestOptions {
  /** Override/merge headers cho request cụ thể. */
  headers?: Record<string, string>;
  /** AbortSignal cho cancellation (React Query tự pass signal). */
  signal?: AbortSignal;
  /** Override timeout cho request cụ thể (ms). */
  timeout?: number;
  /** Next.js fetch options (revalidate, tags, etc.). */
  next?: NextFetchRequestConfig;
}

interface NextFetchRequestConfig {
  revalidate?: number | false;
  tags?: string[];
}

// ============ Internal Helpers ============

function getDefaultBaseUrl(): string {
  if (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_SITE_URL) {
    return `${process.env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "")}/api`;
  }
  return "http://localhost:3000/api";
}

function normalizePath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function buildUrl(
  baseUrl: string,
  path: string,
  params?: Record<string, string | number | boolean | undefined>
): string {
  const url = path.startsWith("http") ? path : `${baseUrl}${normalizePath(path)}`;

  if (!params) return url;

  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      searchParams.append(key, String(value));
    }
  }

  const qs = searchParams.toString();
  if (!qs) return url;

  return url.includes("?") ? `${url}&${qs}` : `${url}?${qs}`;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    if (!response.ok) {
      throw new ApiClientError(response.status, {
        code: "NETWORK_ERROR",
        message: `Unexpected response: ${response.status} ${response.statusText}`,
      });
    }
    return undefined as T;
  }

  const json = (await response.json()) as ApiResponse<T>;

  if (!response.ok || !json.success) {
    const errorBody = json as ApiErrorResponse;
    throw new ApiClientError(response.status, {
      code: errorBody.error?.code ?? "UNKNOWN",
      message: errorBody.error?.message ?? response.statusText,
      details: errorBody.error?.details,
      requestId: errorBody.error?.requestId,
    });
  }

  return json.data;
}

// ============ API Client ============

export interface ApiClient {
  /**
   * GET request – trả data đã unwrap.
   *
   * @example
   * const users = await api.get<User[]>("/users", { params: { page: 1 } });
   */
  get<T = unknown>(
    path: string,
    options?: RequestOptions & {
      params?: Record<string, string | number | boolean | undefined>;
    }
  ): Promise<T>;

  /**
   * POST request – trả data đã unwrap.
   *
   * @example
   * const user = await api.post<User>("/users", { name: "John", email: "john@example.com" });
   */
  post<T = unknown>(
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<T>;

  /**
   * PUT request – trả data đã unwrap.
   *
   * @example
   * const user = await api.put<User>("/users/123", { name: "Jane" });
   */
  put<T = unknown>(
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<T>;

  /**
   * PATCH request – trả data đã unwrap.
   *
   * @example
   * const user = await api.patch<User>("/users/123", { name: "Jane" });
   */
  patch<T = unknown>(
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<T>;

  /**
   * DELETE request – trả data đã unwrap.
   *
   * @example
   * await api.delete("/users/123");
   */
  delete<T = unknown>(path: string, options?: RequestOptions): Promise<T>;
}

/**
 * Tạo API client instance.
 *
 * Cookies (better-auth session) được gửi tự động – không cần config thêm.
 *
 * @example
 * // Default – cookies auto-sent, base URL = NEXT_PUBLIC_SITE_URL/api
 * const api = createApiClient();
 *
 * // Custom config
 * const api = createApiClient({
 *   timeout: 10_000,
 *   onError: (error) => {
 *     if (error.status === 401) window.location.href = "/login";
 *   },
 * });
 */
export function createApiClient(config?: ApiClientConfig): ApiClient {
  const baseUrl = config?.baseUrl ?? getDefaultBaseUrl();
  const defaultHeaders = config?.headers ?? {};
  const defaultTimeout = config?.timeout ?? 30_000;
  const credentials = config?.credentials ?? "include";

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: RequestOptions & {
      params?: Record<string, string | number | boolean | undefined>;
    }
  ): Promise<T> {
    const url = buildUrl(baseUrl, path, options?.params);
    const timeout = options?.timeout ?? defaultTimeout;

    let reqConfig: RequestConfig = {
      url,
      method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...defaultHeaders,
        ...options?.headers,
      },
      body,
      signal: options?.signal,
    };

    if (config?.onRequest) {
      reqConfig = await config.onRequest(reqConfig);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const externalSignal = reqConfig.signal;
    if (externalSignal) {
      externalSignal.addEventListener("abort", () => controller.abort(), {
        once: true,
      });
    }

    try {
      const fetchInit: RequestInit & { next?: NextFetchRequestConfig } = {
        method: reqConfig.method,
        headers: reqConfig.headers,
        credentials,
        signal: controller.signal,
      };

      if (reqConfig.body !== undefined && reqConfig.body !== null) {
        fetchInit.body = JSON.stringify(reqConfig.body);
      }

      if (options?.next) {
        fetchInit.next = options.next;
      }

      const response = await fetch(reqConfig.url, fetchInit);
      return await parseResponse<T>(response);
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (config?.onError) await config.onError(err);
        throw err;
      }

      const isAbort = err instanceof DOMException && err.name === "AbortError";
      const clientError = new ApiClientError(isAbort ? 408 : 0, {
        code: isAbort ? "TIMEOUT" : "NETWORK_ERROR",
        message: isAbort
          ? `Request timed out after ${timeout}ms`
          : err instanceof Error
            ? err.message
            : "Network error",
      });
      if (config?.onError) await config.onError(clientError);
      throw clientError;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return {
    get: <T = unknown>(
      path: string,
      options?: RequestOptions & {
        params?: Record<string, string | number | boolean | undefined>;
      }
    ) => request<T>("GET", path, undefined, options),

    post: <T = unknown>(
      path: string,
      body?: unknown,
      options?: RequestOptions
    ) => request<T>("POST", path, body, options),

    put: <T = unknown>(
      path: string,
      body?: unknown,
      options?: RequestOptions
    ) => request<T>("PUT", path, body, options),

    patch: <T = unknown>(
      path: string,
      body?: unknown,
      options?: RequestOptions
    ) => request<T>("PATCH", path, body, options),

    delete: <T = unknown>(path: string, options?: RequestOptions) =>
      request<T>("DELETE", path, undefined, options),
  };
}

/** Default singleton – base URL: `${NEXT_PUBLIC_SITE_URL}/api`. */
export const apiClient = createApiClient();

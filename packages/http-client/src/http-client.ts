/// <reference lib="dom" />
import type { ApiResponse } from "@megawin/shared/api-types";
import { ApiClientError } from "@megawin/shared/api-types";

// ============ Types ============

export interface HttpClientConfig {
  /** Base URL cho requests (vd "https://api.megawin.com"). */
  baseUrl: string;
  /** Default headers gửi kèm mọi request. */
  headers?: Record<string, string>;
  /** Request timeout (ms). Mặc định: 30000. */
  timeout?: number;
  /**
   * Credentials mode cho fetch.
   * Mặc định: "same-origin".
   * Set "include" khi cần gửi cookies cross-origin (vd better-auth).
   */
  credentials?: RequestCredentials;
  /** Hook trước mỗi request – inject headers, transform config. */
  onRequest?: (
    config: RequestConfig,
  ) => RequestConfig | Promise<RequestConfig>;
  /** Hook khi nhận error – global error handling (redirect, toast, etc.). */
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
  /** AbortSignal cho cancellation. */
  signal?: AbortSignal;
  /** Override timeout cho request cụ thể (ms). */
  timeout?: number;
  /** Next.js extended fetch options (revalidate, tags). */
  next?: { revalidate?: number | false; tags?: string[] };
}

export interface HttpClient {
  get<T = unknown>(
    path: string,
    options?: RequestOptions & {
      params?: Record<string, string | number | boolean | undefined>;
    },
  ): Promise<T>;

  post<T = unknown>(
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<T>;

  put<T = unknown>(
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<T>;

  patch<T = unknown>(
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<T>;

  delete<T = unknown>(path: string, options?: RequestOptions): Promise<T>;
}

// ============ Internals ============

function normalizePath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function buildUrl(
  baseUrl: string,
  path: string,
  params?: Record<string, string | number | boolean | undefined>,
): string {
  const url = path.startsWith("http")
    ? path
    : `${baseUrl}${normalizePath(path)}`;

  if (!params) return url;

  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) searchParams.append(key, String(value));
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
    const err = !json.success ? json.error : undefined;
    throw new ApiClientError(response.status, {
      code: err?.code ?? "UNKNOWN",
      message: err?.message ?? response.statusText,
      details: err?.details,
      requestId: err?.requestId,
    });
  }

  return json.data;
}

// ============ Factory ============

/**
 * Tạo HTTP client instance dùng native fetch.
 *
 * Auto-unwrap ApiResponse: trả T trực tiếp khi success, throw ApiClientError khi lỗi.
 * Tương thích: browser, Node 22+, edge runtime, Deno.
 *
 * @example
 * const api = createHttpClient({ baseUrl: "https://api.example.com" });
 * const users = await api.get<User[]>("/users");
 * const user = await api.post<User>("/users", { name: "John" });
 */
export function createHttpClient(config: HttpClientConfig): HttpClient {
  const { baseUrl } = config;
  const defaultHeaders = config.headers ?? {};
  const defaultTimeout = config.timeout ?? 30_000;
  const credentials = config.credentials ?? "same-origin";

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: RequestOptions & {
      params?: Record<string, string | number | boolean | undefined>;
    },
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

    if (config.onRequest) {
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
      const fetchInit: RequestInit & {
        next?: { revalidate?: number | false; tags?: string[] };
      } = {
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
        if (config.onError) await config.onError(err);
        throw err;
      }

      const isAbort =
        err instanceof DOMException && err.name === "AbortError";
      const clientError = new ApiClientError(isAbort ? 408 : 0, {
        code: isAbort ? "TIMEOUT" : "NETWORK_ERROR",
        message: isAbort
          ? `Request timed out after ${timeout}ms`
          : err instanceof Error
            ? err.message
            : "Network error",
      });
      if (config.onError) await config.onError(clientError);
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
      },
    ) => request<T>("GET", path, undefined, options),

    post: <T = unknown>(path: string, body?: unknown, options?: RequestOptions) =>
      request<T>("POST", path, body, options),

    put: <T = unknown>(path: string, body?: unknown, options?: RequestOptions) =>
      request<T>("PUT", path, body, options),

    patch: <T = unknown>(path: string, body?: unknown, options?: RequestOptions) =>
      request<T>("PATCH", path, body, options),

    delete: <T = unknown>(path: string, options?: RequestOptions) =>
      request<T>("DELETE", path, undefined, options),
  };
}

/// <reference lib="dom" />
import type { ApiResponse } from "@megawin/shared/api-types";
import { ApiClientError } from "@megawin/shared/api-types";

import type { RetryConfig } from "./retry";
import { resolveRetryConfig, withRetry } from "./retry";

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
  /**
   * Default retry config cho mọi request. Mặc định: không retry.
   *
   * Shorthand: truyền `number` = maxRetries với default settings.
   * Per-request override qua {@link RequestOptions.retry}.
   *
   * @example
   * ```ts
   * // Retry 3 lần với default backoff
   * const http = createHttpClient({ baseUrl: "...", retry: 3 });
   *
   * // Full config
   * const http = createHttpClient({
   *   baseUrl: "...",
   *   retry: { maxRetries: 3, baseDelay: 1000 },
   * });
   * ```
   */
  retry?: RetryConfig | number;
  /** Hook trước mỗi request – inject headers, transform config. */
  onRequest?: (config: RequestConfig) => RequestConfig | Promise<RequestConfig>;
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
  /**
   * Override retry cho request cụ thể.
   *
   * - `number` — maxRetries với default settings.
   * - `RetryConfig` — full control.
   * - `false` — disable retry cho request này (kể cả khi client có default).
   */
  retry?: RetryConfig | number | false;
  /**
   * Bypass auto-unwrap + auto-throw của default parser.
   *
   * **Default `false`** — parser áp dụng convention chuẩn của MegaWin API:
   * - `success: true` → trả `json.data` (unwrap).
   * - `success: false` → throw `ApiClientError` với error code từ envelope.
   *
   * **`true`** — trả nguyên JSON `{ success, data?, error? }` cho caller, **chỉ throw khi HTTP status non-ok**
   * (4xx/5xx sau khi hết retry). Caller tự check `response.success` và quyết định xử lý.
   *
   * Dùng khi call outbound đến bên ngoài có envelope riêng cần preserve — ví dụ tenant callback
   * (`@megawin/tenant-gateway`) có 2 tầng success (outer batch + inner per-item), hoặc
   * endpoint mà `success: false` là câu trả lời nghiệp vụ hợp lệ (status check `NOT_FOUND`).
   *
   * @example
   * ```ts
   * const res = await http.post<BatchTransactionResponse>(path, body, { rawResponse: true });
   * if (!res.success) {
   *   // Batch-level fail — xử lý riêng theo flow nghiệp vụ
   * } else {
   *   for (const item of res.data!.results) { ... }
   * }
   * ```
   */
  rawResponse?: boolean;
}

export interface HttpClient {
  get<T = unknown>(
    path: string,
    options?: RequestOptions & {
      params?: Record<string, string | number | boolean | undefined>;
    },
  ): Promise<T>;

  post<T = unknown>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;

  put<T = unknown>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;

  patch<T = unknown>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;

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
  const url = path.startsWith("http") ? path : `${baseUrl}${normalizePath(path)}`;

  if (!params) return url;

  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) searchParams.append(key, String(value));
  }

  const qs = searchParams.toString();
  if (!qs) return url;
  return url.includes("?") ? `${url}&${qs}` : `${url}?${qs}`;
}

async function parseResponse<T>(response: Response, rawResponse?: boolean): Promise<T> {
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

  // rawResponse mode: chỉ throw khi HTTP non-ok; giữ nguyên envelope cho caller.
  // Áp dụng cho outbound calls tới bên ngoài có envelope riêng (tenant callback):
  // caller cần phân biệt "business `success: false` có chủ đích" vs "transport error".
  if (rawResponse) {
    const json = (await response.json()) as T;
    if (!response.ok) {
      throw new ApiClientError(response.status, {
        code: "NETWORK_ERROR",
        message: `HTTP ${response.status} ${response.statusText}`,
      });
    }
    return json;
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
 * Retry: mặc định không retry. Bật qua `config.retry` (client-wide)
 * hoặc `options.retry` (per-request). Khi bật, retry exponential backoff + jitter ±30%
 * cho status codes tạm thời (0, 408, 429, 502, 503, 504).
 *
 * @example
 * ```ts
 * // Không retry (mặc định) — phù hợp browser / Next.js
 * const api = createHttpClient({ baseUrl: "https://api.example.com" });
 *
 * // Retry 3 lần — phù hợp server-to-server outbound calls
 * const api = createHttpClient({ baseUrl: "https://api.tenant.com", retry: 3 });
 *
 * // Per-request override
 * const users = await api.get<User[]>("/users", { retry: false });
 * const result = await api.post<Tx>("/tx", body, { retry: 5 });
 * ```
 */
export function createHttpClient(config: HttpClientConfig): HttpClient {
  const { baseUrl } = config;
  const defaultHeaders = config.headers ?? {};
  const defaultTimeout = config.timeout ?? 30_000;
  const credentials = config.credentials ?? "same-origin";

  /**
   * Thực hiện 1 HTTP request — không retry, không gọi onError.
   * Retry và onError được xử lý ở layer ngoài (`request()`).
   */
  async function executeOnce<T>(
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

      //   const t0 = Date.now();
      const response = await fetch(reqConfig.url, fetchInit);
      //   const elapsed = Date.now() - t0;
      //   console.log(`[HttpClient] ${method} ${url} → ${response.status} in ${elapsed}ms`);

      return await parseResponse<T>(response, options?.rawResponse);
    } catch (err) {
      if (err instanceof ApiClientError) throw err;

      const isAbort = err instanceof DOMException && err.name === "AbortError";
      throw new ApiClientError(isAbort ? 408 : 0, {
        code: isAbort ? "TIMEOUT" : "NETWORK_ERROR",
        message: isAbort
          ? `Request timed out after ${timeout}ms`
          : err instanceof Error
            ? err.message
            : "Network error",
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Entry point: resolve retry config → executeOnce (có hoặc không retry) → onError trên lỗi cuối.
   *
   * onError chỉ fire 1 lần sau khi retry exhausted — không fire trên mỗi attempt.
   */
  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: RequestOptions & {
      params?: Record<string, string | number | boolean | undefined>;
    },
  ): Promise<T> {
    const retryConfig = resolveRetryConfig(options?.retry, config.retry);

    try {
      if (retryConfig) {
        return await withRetry(() => executeOnce<T>(method, path, body, options), retryConfig);
      }
      return await executeOnce<T>(method, path, body, options);
    } catch (err) {
      if (err instanceof ApiClientError && config.onError) {
        await config.onError(err);
      }
      throw err;
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

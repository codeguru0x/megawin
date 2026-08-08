/**
 * Retry utility cho HTTP calls — exponential backoff + jitter.
 *
 * Tích hợp vào {@link createHttpClient} qua config `retry`, hoặc dùng standalone
 * qua `withRetry()` cho custom retry flows.
 *
 * Default retryable status codes:
 * - `0`   — Network error (DNS failure, connection refused, socket hangup).
 * - `408` — Request Timeout.
 * - `429` — Too Many Requests (rate limit).
 * - `502` — Bad Gateway.
 * - `503` — Service Unavailable.
 * - `504` — Gateway Timeout.
 *
 * Backoff schedule (base 500ms):
 * - Attempt 1: ~500ms  (350ms – 650ms)
 * - Attempt 2: ~1000ms (700ms – 1300ms)
 * - Attempt 3: ~2000ms (1400ms – 2600ms)
 */

import { ApiClientError } from "@megawin/shared/api-types";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_BASE_DELAY_MS = 500;

/**
 * HTTP status codes mặc định được retry.
 *
 * | Status | Ý nghĩa                                          |
 * |--------|--------------------------------------------------|
 * | `0`    | Network error — DNS fail, connection refused, etc.|
 * | `408`  | Request Timeout — server hoặc client timeout       |
 * | `429`  | Too Many Requests — rate limit từ server            |
 * | `502`  | Bad Gateway — reverse proxy / LB lỗi               |
 * | `503`  | Service Unavailable — server đang deploy hoặc quá tải |
 * | `504`  | Gateway Timeout — upstream không respond kịp         |
 *
 * Không bao gồm `500` vì Internal Server Error có thể là bug permanent.
 * Caller thêm `500` vào `retryableStatuses` nếu biết server idempotent.
 */
const DEFAULT_RETRYABLE_STATUSES = new Set([0, 408, 429, 502, 503, 504]);

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cấu hình retry cho HTTP requests.
 *
 * Dùng trong {@link HttpClientConfig.retry} (client-wide default)
 * hoặc {@link RequestOptions.retry} (per-request override).
 *
 * @example
 * ```ts
 * // Shorthand — chỉ số lần retry
 * const http = createHttpClient({ baseUrl: "...", retry: 3 });
 *
 * // Full config
 * const http = createHttpClient({
 *   baseUrl: "...",
 *   retry: {
 *     maxRetries: 3,
 *     baseDelay: 1000,
 *     retryableStatuses: [0, 408, 429, 500, 502, 503, 504],
 *     onRetry: (attempt, err) => console.warn(`Retry #${attempt}:`, err.status),
 *   },
 * });
 * ```
 */
export interface RetryConfig {
  /**
   * Số lần retry tối đa. Tổng attempts = `maxRetries + 1` (1 lần gốc + N retry).
   *
   * Set `0` hoặc `false` (trên RequestOptions) để disable retry cho request cụ thể.
   */
  maxRetries: number;

  /**
   * Base delay giữa các lần retry (ms). Mặc định: `500`.
   *
   * Delay thực tế: `baseDelay × 2^attempt ± 30% jitter`.
   */
  baseDelay?: number;

  /**
   * HTTP status codes sẽ retry. Mặc định: `[0, 408, 429, 502, 503, 504]`.
   *
   * Chỉ retry khi error là `ApiClientError` với status nằm trong set này.
   * Lỗi business (400, 401, 403, 404...) không bao giờ retry.
   */
  retryableStatuses?: number[];

  /**
   * Hook gọi trước mỗi lần retry — dùng cho logging, metrics.
   *
   * @param attempt - Retry attempt sắp thực hiện (1-based: 1, 2, 3...).
   * @param error - Error từ attempt trước đó.
   */
  onRetry?: (attempt: number, error: ApiClientError) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve retry config từ per-request override và client default.
 *
 * Ưu tiên: per-request > client default > null (không retry).
 *
 * @internal
 */
export function resolveRetryConfig(
  perRequest: RetryConfig | number | false | undefined,
  clientDefault: RetryConfig | number | undefined,
): RetryConfig | null {
  if (perRequest === false || perRequest === 0) return null;

  const raw = perRequest ?? clientDefault;
  if (raw == null) return null;

  if (typeof raw === "number") {
    return raw > 0 ? { maxRetries: raw } : null;
  }

  return raw.maxRetries > 0 ? raw : null;
}

function isRetryable(err: unknown, statuses: Set<number>): boolean {
  return err instanceof ApiClientError && statuses.has(err.status);
}

// ─────────────────────────────────────────────────────────────────────────────
// Core
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Thực thi async function với retry — exponential backoff + jitter ±30%.
 *
 * Chỉ retry khi error là {@link ApiClientError} với status code retryable.
 * Lỗi business (400, 401, 404...) throw ngay lập tức — retry không giúp gì.
 *
 * @param fn - Async function cần retry (thường là HTTP call).
 * @param config - Retry config hoặc số lần retry tối đa.
 * @returns Kết quả từ `fn` nếu thành công.
 * @throws Lỗi cuối cùng nếu hết retry hoặc lỗi không retryable.
 *
 * @example
 * ```ts
 * const result = await withRetry(
 *   () => http.post("/path", body),
 *   { maxRetries: 3, onRetry: (n, e) => log.warn(`retry #${n}`, e.status) },
 * );
 * ```
 */
export async function withRetry<T>(fn: () => Promise<T>, config: RetryConfig | number): Promise<T> {
  const resolved = typeof config === "number" ? { maxRetries: config } : config;
  const { maxRetries, baseDelay = DEFAULT_BASE_DELAY_MS, retryableStatuses, onRetry } = resolved;

  const statusSet = retryableStatuses ? new Set(retryableStatuses) : DEFAULT_RETRYABLE_STATUSES;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (attempt === maxRetries || !isRetryable(err, statusSet)) {
        break;
      }

      if (onRetry) {
        onRetry(attempt + 1, err as ApiClientError);
      }

      // Exponential backoff + jitter ±30%.
      // Range: [delay × 0.7, delay × 1.3] — phân tán requests tránh thundering herd.
      const delay = baseDelay * Math.pow(2, attempt);
      const jitter = delay * 0.3 * (Math.random() * 2 - 1);
      await new Promise((r) => setTimeout(r, delay + jitter));
    }
  }

  throw lastError;
}

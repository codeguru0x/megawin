/**
 * Log Utilities – Structured logging cho Vercel / Node.js runtimes.
 *
 * Vercel Logs chỉ hiển thị đẹp khi output là plain string hoặc JSON một dòng.
 * `console.error(err)` với Error object phức tạp (AWS SDK, Mongoose...) thường
 * bị cắt hoặc mất thông tin quan trọng.
 *
 * Module này cung cấp:
 * - `serializeError(err)` — chuyển bất kỳ error thành plain object serializable
 * - `logError(label, err, ctx?)` — ghi `console.error` đúng format cho Vercel
 * - `logWarn(label, message, ctx?)` — ghi `console.warn` có structured context
 * - `logInfo(label, message, ctx?)` — ghi `console.log` có structured context
 * - `truncateErrorMessage(err, maxLength?)` — trích + truncate error message
 *   để persist vào DB field có giới hạn độ dài
 */

import { AppException } from "../errors/app-exception";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Shape của error đã được serialize thành plain object. */
export interface SerializedError {
  name: string;
  message: string;
  /** Stack trace của error. */
  stack?: string;
  /** `AppException.code` nếu có. */
  code?: string;
  /** `AppException.details` nếu có. */
  details?: unknown;
  /** `AppException.statusCode` nếu có. */
  statusCode?: number;
  /** AWS SDK v3: `$metadata.httpStatusCode`. */
  httpStatusCode?: number;
  /** AWS SDK v3: `$metadata.requestId`. */
  requestId?: number | string;
  /** AWS SDK v3: `$fault` — `"client"` hoặc `"server"`. */
  fault?: string;
}

/** Context data kèm theo log entry — bất kỳ key-value serializable. */
export type LogContext = Record<string, unknown>;

// ── Core serializer ───────────────────────────────────────────────────────────

/**
 * Chuyển bất kỳ `unknown` error thành plain object serializable.
 *
 * Xử lý đặc biệt:
 * - `AppException` → trích `code`, `details`, `statusCode`
 * - AWS SDK v3 Error → trích `$metadata.httpStatusCode`, `$metadata.requestId`, `$fault`
 * - Generic `Error` → `name` + `message` + `stack`
 * - Primitive / unknown → wrap thành `{ name: "UnknownError", message: String(value) }`
 *
 * @example
 * const serialized = serializeError(err);
 * console.error(JSON.stringify(serialized));
 */
export function serializeError(err: unknown): SerializedError {
  if (err instanceof AppException) {
    const result: SerializedError = {
      name: err.name,
      message: err.message,
      code: err.code,
      stack: err.stack,
    };
    if (err.details !== undefined) result.details = err.details;
    if (err.statusCode !== undefined) result.statusCode = err.statusCode;
    return result;
  }

  if (err instanceof Error) {
    const result: SerializedError = {
      name: err.name,
      message: err.message,
      stack: err.stack,
    };

    // AWS SDK v3 errors expose $metadata và $fault
    const awsErr = err as Error & {
      $metadata?: { httpStatusCode?: number; requestId?: string };
      $fault?: string;
    };
    if (awsErr.$metadata?.httpStatusCode !== undefined) {
      result.httpStatusCode = awsErr.$metadata.httpStatusCode;
    }
    if (awsErr.$metadata?.requestId !== undefined) {
      result.requestId = awsErr.$metadata.requestId;
    }
    if (awsErr.$fault !== undefined) {
      result.fault = awsErr.$fault;
    }

    return result;
  }

  // Primitive hoặc không phải Error (string thrown, null, object...)
  return {
    name: "UnknownError",
    message: typeof err === "string" ? err : (JSON.stringify(err) ?? String(err)),
  };
}

// ── Log helpers ───────────────────────────────────────────────────────────────

/**
 * Ghi `console.error` với structured format hiển thị đúng trên Vercel Logs.
 *
 * Output: `[label] message  {error: {...}, ...ctx}`
 *
 * @param label - Tên class / function để trace nhanh. VD: `"TriggerSettle"`.
 * @param err   - Bất kỳ error object nào (`AppException`, AWS SDK error, generic `Error`, ...).
 * @param ctx   - Context data kèm theo để debug (drawId, tenantId, ...).
 *
 * @example
 * try {
 *   await startExecution({ ... });
 * } catch (err) {
 *   logError("TriggerSettle", err, { drawId: input.drawId });
 *   throw new AppException("SFN_START_FAILED", "Không thể khởi chạy settle worker");
 * }
 */
export function logError(label: string, err: unknown, ctx?: LogContext): void {
  const serialized = serializeError(err);
  console.error(`[${label}]`, serialized.message, { error: serialized, ...ctx });
}

/**
 * Ghi `console.warn` với structured context.
 *
 * @param label   - Tên class / function.
 * @param message - Mô tả ngắn về warning.
 * @param ctx     - Context data kèm theo.
 *
 * @example
 * logWarn("TriggerSettle", "Draw đã ở trạng thái settling, bỏ qua transition", { drawId });
 */
export function logWarn(label: string, message: string, ctx?: LogContext): void {
  if (ctx !== undefined) {
    console.warn(`[${label}]`, message, ctx);
  } else {
    console.warn(`[${label}]`, message);
  }
}

/**
 * Ghi `console.log` với structured context.
 *
 * @param label   - Tên class / function.
 * @param message - Mô tả ngắn về event.
 * @param ctx     - Context data kèm theo.
 *
 * @example
 * logInfo("TriggerSettle", "SFN started successfully", { drawId, executionArn });
 */
export function logInfo(label: string, message: string, ctx?: LogContext): void {
  if (ctx !== undefined) {
    console.log(`[${label}]`, message, ctx);
  } else {
    console.log(`[${label}]`, message);
  }
}

// ── Error message helpers ─────────────────────────────────────────────────────

/** Default cap cho error message khi persist vào DB / log fields có giới hạn. */
const DEFAULT_TRUNCATE_LENGTH = 500;

/**
 * Trích `message` từ bất kỳ `unknown` error và truncate xuống dưới `maxLength`.
 *
 * Dùng khi cần persist error message vào field có giới hạn độ dài (VD:
 * `worker_locks.lastError`, audit log) — tránh bloat DB và đảm bảo render đẹp
 * trên các UI có max width.
 *
 * Trả về:
 * - `Error` instance → `err.message`.
 * - Primitive / object khác → `String(err)`.
 *
 * Cuối chuỗi truncated thêm `… [truncated]` để consumer biết đã bị cắt.
 *
 * @param err       - Bất kỳ error object nào.
 * @param maxLength - Số ký tự tối đa trước khi truncate. Default `500`.
 *
 * @example
 * await lockRepo.finalizeAndRelease(key, token, {
 *   lastError: truncateErrorMessage(err),
 * });
 */
export function truncateErrorMessage(err: unknown, maxLength: number = DEFAULT_TRUNCATE_LENGTH): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.length > maxLength ? `${raw.slice(0, maxLength)}… [truncated]` : raw;
}

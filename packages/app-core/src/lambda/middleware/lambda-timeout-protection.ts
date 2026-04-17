/**
 * Middy middleware: tự throw trước khi Lambda bị kill bởi AWS timeout.
 *
 * Lambda timeout trả raw `LambdaTimeoutError` — không qua error handler,
 * client nhận JSON lạ thay vì API response chuẩn.
 *
 * Middleware này đặt setTimeout ngắn hơn Lambda timeout (mặc định 2s buffer).
 * Nếu handler chưa xong trước deadline → throw AppException.serviceUnavailable
 * → Middy onError bắt → trả API response chuẩn { success: false, error: {...} }.
 *
 * Chỉ hoạt động khi context.getRemainingTimeInMillis() có sẵn (AWS / serverless-offline).
 */

import { AppException } from "@megawin/shared/errors";

interface LambdaTimeoutProtectionOptions {
  /**
   * Buffer time (ms) trước Lambda deadline để throw.
   * @default 2000
   */
  bufferMs?: number;
}

export function lambdaTimeoutProtection(options?: LambdaTimeoutProtectionOptions) {
  const bufferMs = options?.bufferMs ?? 2000;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  return {
    before: (request: { context?: { getRemainingTimeInMillis?: () => number } }) => {
      const remaining = request.context?.getRemainingTimeInMillis?.();
      if (!remaining || remaining <= bufferMs) return;

      const deadline = remaining - bufferMs;

      return new Promise<void>((_resolve, reject) => {
        timeoutId = setTimeout(() => {
          reject(
            AppException.serviceUnavailable(
              "Hệ thống xử lý quá thời gian cho phép, vui lòng thử lại.",
            ),
          );
        }, deadline);

        // Store resolve so `after`/`onError` can cancel.
        (request as Record<string, unknown>).__timeoutResolve = _resolve;
      });
    },

    after: (request: Record<string, unknown>) => {
      if (timeoutId) clearTimeout(timeoutId);
      const resolve = request.__timeoutResolve as (() => void) | undefined;
      resolve?.();
    },

    onError: (request: Record<string, unknown>) => {
      if (timeoutId) clearTimeout(timeoutId);
      const resolve = request.__timeoutResolve as (() => void) | undefined;
      resolve?.();
    },
  };
}

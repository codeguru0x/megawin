/**
 * Types dùng chung cho `LockedWorkerUseCase` — skip marker và result union.
 *
 * Tách riêng khỏi class để tránh circular import khi consumer chỉ cần type guard
 * (`isLockedWorkerSkipped`) hoặc type (`LockedWorkerResult<O>`).
 */

/**
 * Marker trả về khi worker không chạy được business logic.
 *
 * - `"locked"` — lock đang held bởi invocation khác (race benign, thử lại tick sau).
 * - `"disabled"` — ops đã set `worker_locks.isEnabled = false` (không retry).
 *
 * `skipped` luôn là `true`; không có executed case mang field này để tránh pollute
 * output của subclass.
 */
export interface LockedWorkerSkipped {
  /** Luôn là `true` — narrow discriminator cho type guard. */
  skipped: true;
  /** Lý do bị skip — ops theo dõi `"disabled"`, scheduler tolerate `"locked"`. */
  reason: "locked" | "disabled";
}

/**
 * Return type của `LockedWorkerUseCase.run(input)`.
 *
 * Caller kiểm tra `"skipped" in result` (hoặc dùng `isLockedWorkerSkipped`) để
 * narrow TypeScript về `O` khi executed.
 *
 * @template O - Output chuẩn của subclass khi business logic chạy thành công.
 */
export type LockedWorkerResult<O> = O | LockedWorkerSkipped;

/**
 * Type guard — narrow `LockedWorkerResult<O>` về `LockedWorkerSkipped`.
 *
 * @example
 * ```ts
 * const result = await useCase.run();
 * if (isLockedWorkerSkipped(result)) {
 *   console.info(`skipped: ${result.reason}`);
 *   return result;
 * }
 * // result: O
 * return result;
 * ```
 */
export function isLockedWorkerSkipped<O>(
  result: LockedWorkerResult<O>,
): result is LockedWorkerSkipped {
  return (
    typeof result === "object" &&
    result !== null &&
    "skipped" in result &&
    (result as { skipped: unknown }).skipped === true
  );
}

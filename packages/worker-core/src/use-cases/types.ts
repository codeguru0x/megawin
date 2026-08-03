/**
 * Types dùng chung cho `SingleRunWorker` — skip marker và result union.
 *
 * Tách riêng khỏi class để tránh circular import khi consumer chỉ cần type guard
 * (`isWorkerRunSkipped`) hoặc type (`WorkerRunResult<O>`).
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
export interface WorkerRunSkipped {
  /** Luôn là `true` — narrow discriminator cho type guard. */
  skipped: true;
  /** Lý do bị skip — ops theo dõi `"disabled"`, scheduler tolerate `"locked"`. */
  reason: "locked" | "disabled";
}

/**
 * Return type của `SingleRunWorker.run(input)`.
 *
 * Caller kiểm tra `"skipped" in result` (hoặc dùng `isWorkerRunSkipped`) để
 * narrow TypeScript về `O` khi executed.
 *
 * @template O - Output chuẩn của subclass khi business logic chạy thành công.
 */
export type WorkerRunResult<O> = O | WorkerRunSkipped;

/**
 * Type guard — narrow `WorkerRunResult<O>` về `WorkerRunSkipped`.
 *
 * @example
 * ```ts
 * const result = await useCase.run();
 * if (isWorkerRunSkipped(result)) {
 *   console.info(`skipped: ${result.reason}`);
 *   return result;
 * }
 * // result: O
 * return result;
 * ```
 */
export function isWorkerRunSkipped<O>(result: WorkerRunResult<O>): result is WorkerRunSkipped {
  return (
    typeof result === "object" &&
    result !== null &&
    "skipped" in result &&
    (result as { skipped: unknown }).skipped === true
  );
}

/** Kết quả 1 tick trả về cho `TickLoopWorker` — subclass báo có nên dừng sớm. */
export interface TickOutcome {
  /** `true` → thoát vòng lặp ngay (VD: lock bị takeover, kill-switch). Optional, default false. */
  shouldStop?: boolean;
}

/** Kết quả cả invocation từ phía base `TickLoopWorker` — subclass thường bọc thêm counters riêng. */
export interface TickLoopResult {
  /** Số tick đã chạy trong invocation. */
  ticks: number;
}

/**
 * Worker Core – Lock Taken Over Error
 *
 * Signal nội bộ (KHÔNG phải lỗi hệ thống thật) để phân biệt 2 loại thất bại trong vòng lặp
 * xử lý per-item của `runTick`/`runLocked`:
 *
 * 1. **Lỗi 1 item** (data bẩn, doc quá cỡ…) — chỉ nên skip item đó, log, ghi
 *    `recordStalledItem`, rồi tiếp tục các item khác trong tick.
 * 2. **Mất lock giữa chừng** (`extendLock()` trả `false` — TTL hết hạn, invocation khác đã
 *    takeover) — KHÔNG phải "item lỗi", mà là tín hiệu PHẢI dừng ngay cả invocation, vì nếu
 *    tiếp tục ghi thì 2 worker (cũ + mới) sẽ ghi đè lẫn nhau — đúng cái mà lock sinh ra để chặn.
 *
 * Nếu vòng lặp per-item bọc `try/catch` để lỗi (1) không làm chết cả tick, mà không phân biệt
 * loại lỗi thì error mất-lock cũng bị catch đó "ăn" mất → worker sai lầm chạy tiếp item sau.
 * Dùng class riêng để nhận diện qua `instanceof` và re-throw lên `SingleRunWorker` (ghi
 * `lastError`, release lock) — thay vì âm thầm nuốt như lỗi item thường.
 *
 * @example
 * ```ts
 * const ok = await this.extendLock();
 * if (!ok) {
 *   throw new LockTakenOverError(this.resolveLockKey());
 * }
 * // ...
 * try {
 *   await this.processItem(item);
 * } catch (error) {
 *   if (error instanceof LockTakenOverError) {
 *     throw error; // mất lock — dừng cả invocation, KHÔNG coi như item lỗi
 *   }
 *   this.recordStalledItem(item.id, error); // item lỗi bình thường — bỏ qua, chạy tiếp
 * }
 * ```
 */
export class LockTakenOverError extends Error {
  constructor(lockKey: string) {
    super(`${lockKey} lock taken over — abort`);
    this.name = "LockTakenOverError";
  }
}

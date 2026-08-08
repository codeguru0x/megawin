import { sleep } from "@megawin/shared/utils";

import type { TickLoopResult, TickOutcome } from "../types";
import { SingleRunWorker } from "./single-run-worker";

/**
 * Worker chạy LOOP nhiều tick trong 1 invocation Lambda (cadence < 1 phút).
 *
 * EventBridge min schedule = 1 phút; game quay nhanh (Keno 6–8 phút/kỳ) cần cập nhật dày hơn
 * → mỗi invocation loop `runTick()` + `sleep` tới nhịp `resolveTickMs`, thoát trước deadline
 * (`budgetMs`, default 55s < Lambda timeout) để invocation kế tiếp takeover qua lock TTL.
 *
 * Base CHỈ lo: deadline, giữ nhịp đều tick (trừ thời gian xử lý), hook `beforeLoop` 1 lần
 * đầu invocation. KHÔNG lo hàng đợi việc / watermark / counters — nghiệp vụ per-game nằm
 * trọn trong subclass (analysis keno-stats-worker-simplification §5.2).
 *
 * Kế thừa {@link SingleRunWorker} — có toàn bộ lock lifecycle (acquire/release, kill-switch,
 * cursor, stalled-item tracking) của class cha; `TickLoopWorker` chỉ thêm vòng lặp tick bên
 * trong `runLocked`.
 *
 * ## Thứ tự gọi khi Lambda invoke (đọc trước khi viết subclass)
 *
 * 1. `SingleRunWorker.execute()` (class cha, **KHÔNG override**) — check kill-switch
 *    `isEnabled`, atomic `tryAcquire` lock. Skip (return, KHÔNG throw) nếu disabled hoặc
 *    lock đang bị invocation khác giữ.
 * 2. `TickLoopWorker.runLocked(input)` — **final, subclass KHÔNG override** — chạy tuần tự:
 *    1. `beforeLoop(input)` — đúng 1 LẦN đầu invocation, TRƯỚC vòng lặp (đọc config, enroll…).
 *    2. `resolveTickMs(input)` — đúng 1 LẦN, NGAY SAU `beforeLoop` — nhịp tick (ms).
 *    3. Loop `runTick(input)` — lặp lại nhiều lần tới khi hết `budgetMs` HOẶC
 *       `outcome.shouldStop === true`; giữa 2 tick liên tiếp `sleep` phần `tickMs` còn lại
 *       (sau khi trừ thời gian xử lý tick) để giữ nhịp đều.
 *    4. `buildResult(loop)` — đúng 1 LẦN, khi thoát loop (hết budget hoặc `shouldStop`) — build
 *       output cuối từ số tick đã chạy.
 * 3. `SingleRunWorker.finalizeAndRelease` (class cha) — ghi meta (`lastSuccessAt`/`lastError`/
 *    `stalledItems`) + clear `ownerToken`, LUÔN chạy dù bước 2 throw hay không, rồi re-throw
 *    error (nếu có) lên `InternalUseCase`.
 *
 * ## Method subclass cần khai báo (đúng theo thứ tự gọi ở trên)
 *
 * - `ttlSeconds`, `resolveLockKey(input)` — kế thừa từ {@link SingleRunWorker}, dùng ở bước 1.
 * - `beforeLoop(input)` — optional, default no-op, dùng ở bước 2.1.
 * - `resolveTickMs(input)` — bắt buộc, dùng ở bước 2.2.
 * - `runTick(input)` — bắt buộc, dùng ở bước 2.3.
 * - `buildResult(loop)` — bắt buộc, dùng ở bước 2.4.
 */
export abstract class TickLoopWorker<I, O> extends SingleRunWorker<I, O> {
  /** Budget 1 invocation (ms) — thoát trước Lambda timeout để invocation sau takeover. */
  protected readonly budgetMs: number = 55_000;

  /** Nhịp tick (ms) — đọc từ config động (VD `ops.stats.tickSeconds`), gọi 1 lần đầu invocation. */
  protected abstract resolveTickMs(input: I): Promise<number>;

  /** Hook chạy 1 LẦN đầu invocation (sau khi đã giữ lock, trước vòng lặp). Default no-op. */
  protected async beforeLoop(_input: I): Promise<void> {}

  /** 1 tick nghiệp vụ. Trả `shouldStop: true` để thoát vòng lặp sớm. */
  protected abstract runTick(input: I): Promise<TickOutcome>;

  /** Build output cuối từ số tick đã chạy — subclass gắn counters riêng đã tự tích luỹ. */
  protected abstract buildResult(loop: TickLoopResult): O;

  protected async runLocked(input: I): Promise<O> {
    await this.beforeLoop(input);
    const tickMs = await this.resolveTickMs(input);
    const deadline = Date.now() + this.budgetMs;
    let ticks = 0;

    while (Date.now() < deadline) {
      const tickStart = Date.now();
      const outcome = await this.runTick(input);
      ticks += 1;

      if (outcome.shouldStop) {
        break;
      }

      // Giữ nhịp đều tickMs: trừ thời gian đã xử lý tick này; không ngủ quá deadline.
      const elapsed = Date.now() - tickStart;
      const remaining = Math.min(tickMs - elapsed, deadline - Date.now());
      if (remaining > 0) {
        await sleep(remaining);
      }
    }

    return this.buildResult({ ticks });
  }
}

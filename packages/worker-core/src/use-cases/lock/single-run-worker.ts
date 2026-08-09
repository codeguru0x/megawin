/**
 * Base worker cho tác vụ cần distributed lock qua MongoDB, chạy **1 lần** trong 1
 * invocation (acquire → run → release). Đối lập với {@link TickLoopWorker} (loop nhiều
 * tick trong 1 invocation) — dùng `SingleRunWorker` khi mỗi invocation chỉ cần chạy
 * `runLocked` đúng 1 lượt (VD: xử lý 1 batch rồi thoát, để invocation/tick sau tiếp tục).
 *
 * Subclass chỉ implement `ttlSeconds`, `resolveLockKey(input)`, `runLocked(input)`.
 * Base class tự quản toàn bộ lock lifecycle:
 *   1. Check kill-switch `isEnabled` — skip nếu ops disabled.
 *   2. Atomic `tryAcquire` — skip nếu invocation khác đang giữ.
 *   3. Chạy `runLocked(input)`.
 *   4. `finalizeAndRelease` — ghi meta (`cursor`/`lastSuccessAt`/`lastError`) +
 *      clear `ownerToken = null` trong **1 DB update atomic**.
 *
 * ## `kind` doc — KHÔNG subclass tự khai báo
 *
 * Mọi subclass (kể cả gián tiếp qua `TickLoopWorker`) tự động ghi `kind:
 * WorkerLockKind.Worker` — hardcode trong `execute()` ở dưới, KHÔNG có field/param để override.
 * Muốn `kind: "business"` thì dùng `DistributedMutex`, không phải subclass ở đây với
 * `kind` khác. Xem bảng so sánh 2 kind ở JSDoc `WorkerLockKind` (`../../entities/worker-lock.ts`).
 *
 * CRASH-SAFE: crash trong `runLocked` → lock bị giữ đến `expiresAt` → invocation
 * sau takeover qua filter `expiresAt <= now` trong `tryAcquire`.
 *
 * IDEMPOTENT: subclass tự đảm bảo (upsert với version guard, cursor-based v.v.).
 *
 * ## Error propagation
 *
 * - `runLocked` throw → base class ghi `lastError`, release, re-throw lên `InternalUseCase`.
 * - Skip (`locked`/`disabled`) KHÔNG throw — return `WorkerRunSkipped`.
 * - Lỗi ở `finalizeAndRelease` chỉ log warning, không làm mất business result
 *   (lock sẽ tự takeover qua `expiresAt <= now` ở lần sau).
 *
 * ## Dùng cursor trong subclass
 *
 * Subclass gọi `await this.setCursor(value)` để persist checkpoint **ngay lập tức**
 * vào DB. Mỗi call = 1 DB round-trip — gọi sau mỗi batch/iteration để checkpoint
 * được lưu sớm nhất có thể.
 *
 * ```ts
 * protected async runLocked(input: Input): Promise<Output> {
 *   const lock = await this.lockRepo.findByKey(this.resolveLockKey(input));
 *   let cursor = lock?.cursor ?? "0"; // đọc cursor từ lần chạy trước
 *   let processedTotal = 0;
 *
 *   while (hasWork() && withinBudget()) {
 *     const batch = await fetchBatch(cursor);
 *     await commitBatch(batch);              // commit data trước
 *     await this.setCursor(batch.nextCursor); // rồi persist cursor ngay
 *     cursor = batch.nextCursor;
 *     processedTotal += batch.count;
 *   }
 *
 *   return { processed: processedTotal };
 * }
 * ```
 *
 * ## Tại sao KHÔNG buffer cursor trong memory?
 *
 * Nếu buffer và chỉ flush ở finalize, khi Lambda bị kill cứng (timeout, OOM,
 * SIGKILL), toàn bộ cursor từ các iteration trước MẤT sạch → lần sau redo
 * cả loạt work đã done. Persist ngay đảm bảo progress không mất quá 1 batch.
 *
 * ## At-least-once vs at-most-once
 *
 * - **At-least-once**: `commitBatch` → `setCursor`. Crash giữa 2 bước → lần sau
 *   process lại batch đó. Idempotent handlers xử lý OK.
 * - **At-most-once**: `setCursor` → `commitBatch`. Crash giữa 2 bước → batch đó
 *   bị skip. Chỉ dùng khi business chấp nhận bỏ qua.
 *
 * Default nên dùng at-least-once — an toàn hơn.
 *
 * ## Handling `setCursor` return false
 *
 * Trả `false` = lock đã bị takeover (owner khác đang giữ). Subclass PHẢI throw
 * để base class không tiếp tục work — tránh 2 invocation cùng ghi đè nhau.
 *
 * ```ts
 * const ok = await this.setCursor(next);
 * if (!ok) throw new Error("lock taken over; abort");
 * ```
 *
 * ## Heartbeat (`extendLock`)
 *
 * Gọi `await this.extendLock()` khi muốn gia hạn TTL giữa chừng — chỉ cần khi
 * `ttlSeconds < total runtime`. Với thiết kế `ttlSeconds > Lambda timeout` thì
 * KHÔNG cần gọi, vì Lambda sẽ bị kill trước khi lock expire.
 *
 * `extendLock` trả `false` nghĩa là lock đã bị takeover (expired + owner khác
 * acquire). Subclass nhận `false` PHẢI abort để tránh double-execute.
 *
 * ## Stalled-item tracking (`recordStalledItem`/`clearStalledItem`)
 *
 * Concern **observability**, tách khỏi lock lifecycle qua composition — xem
 * {@link StalledItemTracker}. Base class chỉ giữ 1 instance và delegate; subclass
 * dùng qua đúng 2 method protected này, không cần biết tracker tồn tại.
 *
 * @template I - Input của subclass. Dùng `void` nếu không nhận input.
 * @template O - Output khi executed. KHÔNG được chứa field `skipped`.
 *
 * @example
 * ```ts
 * class ProcessMainUseCase extends SingleRunWorker<Input, Output> {
 *   protected readonly ttlSeconds = 60;
 *   protected resolveLockKey() { return "tenant-dispatch:main"; }
 *
 *   protected async runLocked(input: Input): Promise<Output> {
 *     const batch = await processNextBatch();
 *     await this.setCursor(batch.nextCursor);
 *     return { processed: batch.count };
 *   }
 * }
 * ```
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { truncateErrorMessage } from "@megawin/shared/utils";

import { WorkerLockKind } from "../../entities";
import { WorkerLockRepository } from "../../infras/repos";
import { StalledItemTracker } from "../health/stalled-item-tracker";
import type { WorkerRunResult } from "../types";
import { randomUUID } from "node:crypto";

export abstract class SingleRunWorker<I, O> extends InternalUseCase<I, WorkerRunResult<O>> {
  protected readonly lockRepo = new WorkerLockRepository();

  /** Observability — streak lỗi per-item, xem {@link StalledItemTracker}. */
  private readonly stalledTracker = new StalledItemTracker();

  // Lưu tạm trong execute() để các protected method khác (extendLock, setCursor) dùng.
  // Safe vì Lambda single-threaded — mỗi invocation có instance riêng.
  private _lockKey = "";
  private _ownerToken = "";

  /**
   * Giá trị cursor cuối cùng mà subclass đã persist qua `setCursor`.
   *
   * Dùng tri-state để finalize biết cursor đang ở đâu:
   * - `undefined` → subclass chưa bao giờ gọi `setCursor` → finalize KHÔNG đụng cursor.
   * - `null` → subclass đã clear cursor → đã persist → finalize KHÔNG cần ghi lại.
   * - `string` → subclass đã persist giá trị này → finalize KHÔNG cần ghi lại.
   *
   * Khác với buffer trước đây: giá trị này ĐÃ có trong DB tại thời điểm lưu —
   * field này chỉ để tránh ghi lại redundant ở finalize.
   */
  private _lastPersistedCursor: string | null | undefined = undefined;

  /**
   * Mô tả ngắn worker này làm gì — hiện trên trang BO Workers health.
   *
   * KHÔNG override được per-input (khác `resolveLockKey`): mô tả thuộc *class worker*.
   * Bỏ trống thì BO hiện `lockKey`.
   *
   * @example "Đồng bộ thống kê cược Keno (delta) mỗi 20s"
   */
  protected readonly description?: string;

  /**
   * TTL (giây) cho lock — thời gian lock coi là "còn sống" sau `tryAcquire`.
   *
   * ## Công thức chuẩn: `ttlSeconds = Lambda timeout`
   *
   * TTL CHỈ có tác dụng khi worker **crash không release**. Release bình thường
   * set `ownerToken = null` → invocation sau acquire ngay qua filter
   * `{ ownerToken: null }`, không phải đợi TTL.
   *
   * Vì Lambda bị kill cứng ở `timeout`, runtime tối đa = `timeout`. Chọn
   * `TTL = timeout` đảm bảo sau crash, invocation schedule kế tiếp luôn thấy
   * `expiresAt <= now` → takeover.
   *
   * KHÔNG cần cộng buffer — chỉ làm invocation sau chờ lâu hơn để takeover
   * khi worker thật sự chết (clock skew giữa Lambda & Mongo thực tế < 1s).
   *
   * `extendLock()` chỉ cần khi runtime có thể vượt `timeout` (không xảy ra với
   * Lambda). Với các worker chạy trong container dài hạn, subclass mới cần gọi.
   */
  protected abstract readonly ttlSeconds: number;

  /**
   * Lock key — static hoặc derive từ input (VD: per-tenant lock).
   * Convention: `"{worker-name}:{lane}"`. VD: `"tenant-dispatch:main"`.
   */
  protected abstract resolveLockKey(input: I): string;

  /**
   * Business logic bên trong lock. Throw nếu gặp lỗi — base class ghi `lastError` + re-throw.
   *
   * Dùng `await this.setCursor(value)` để persist checkpoint ngay lập tức (xem JSDoc class).
   * Dùng `this.extendLock()` nếu cần gia hạn TTL giữa chừng.
   * Đọc cursor cũ từ `this.lockRepo.findByKey(lockKey)` ở đầu hàm.
   */
  protected abstract runLocked(input: I): Promise<O>;

  /**
   * Persist checkpoint cursor vào DB **ngay lập tức**.
   *
   * ## Khi nào gọi?
   *
   * Gọi **sau khi commit thành công 1 batch/đơn vị công việc**, trước khi bắt đầu batch
   * kế tiếp. Nếu `runLocked` loop nhiều iteration, gọi sau mỗi iteration để
   * checkpoint được persist sớm nhất có thể.
   *
   * ## Tại sao không buffer?
   *
   * Nếu chỉ lưu trong memory và persist 1 lần ở `finalize`, khi Lambda bị **kill cứng**
   * (timeout, OOM, SIGKILL) thì toàn bộ cursor từ các iteration trước MẤT hết —
   * lần chạy sau phải redo từ cursor lần trước đó. Persist ngay đảm bảo progress
   * không bao giờ bị mất quá 1 batch.
   *
   * ## Trade-off
   *
   * Mỗi call = 1 DB round-trip. Nếu loop 1000 iteration nhanh, subclass nên
   * batch cursor update (VD: flush mỗi 10 iteration) để giảm IO — nhưng đây là
   * optimization của subclass, không phải default.
   *
   * Truyền `null` để clear cursor (VD: reset về đầu).
   *
   * Trả `false` nếu lock đã bị takeover (ownerToken không match) — subclass nên abort.
   */
  protected async setCursor(cursor: string | null): Promise<boolean> {
    // Skip nếu cursor không đổi — tránh DB call thừa khi subclass vô tình gọi trùng.
    if (cursor === this._lastPersistedCursor) {
      return true;
    }

    const ok = await this.lockRepo.saveCursor(this._lockKey, this._ownerToken, cursor);

    if (ok) {
      this._lastPersistedCursor = cursor;
    }

    return ok;
  }

  /**
   * Gia hạn TTL cho lock đang held.
   *
   * Trả `false` nếu lock đã expire/bị takeover — subclass PHẢI abort công việc
   * để tránh double-execute cùng với owner mới.
   *
   * Chỉ cần gọi khi `ttlSeconds < total runtime`. Với TTL > Lambda timeout, không cần.
   */
  protected extendLock(): Promise<boolean> {
    return this.lockRepo.extend(this._lockKey, this._ownerToken, this.ttlSeconds);
  }

  /**
   * Ghi nhận 1 đơn vị công việc vừa LỖI — cộng streak, giữ trong RAM.
   * Delegate sang {@link StalledItemTracker.record} — xem JSDoc đó cho chi tiết
   * thiết kế (KHÔNG I/O, KHÔNG throw, buffer là ĐÚNG).
   */
  protected recordStalledItem(itemKey: string, error: unknown): void {
    this.stalledTracker.record(itemKey, error);
  }

  /**
   * Ghi nhận item xử lý THÀNH CÔNG — xoá khỏi danh sách kẹt (reset streak).
   * Delegate sang {@link StalledItemTracker.clear}.
   */
  protected clearStalledItem(itemKey: string): void {
    this.stalledTracker.clear(itemKey);
  }

  protected async execute(input: I): Promise<WorkerRunResult<O>> {
    this._lockKey = this.resolveLockKey(input);
    this._ownerToken = randomUUID();
    this._lastPersistedCursor = undefined;
    this.stalledTracker.reset();

    // ── Bước 1: Check kill-switch ─────────────────────────────────────────
    // Không atomic nhưng acceptable: `isEnabled` chỉ đổi bởi ops qua mongo shell,
    // race window cực nhỏ (1 query duration). Ops disable lúc worker đang chạy
    // thì lần chạy hiện tại vẫn hoàn tất — lần sau mới skip.
    const existing = await this.lockRepo.findByKey(this._lockKey);
    if (existing && !existing.isEnabled) {
      console.warn(`[worker-lock] disabled — skip: ${this._lockKey}`);
      return { skipped: true, reason: "disabled" };
    }

    // ── Bước 2: Atomic acquire ────────────────────────────────────────────
    const acquired = await this.lockRepo.tryAcquire({
      lockKey: this._lockKey,
      ownerToken: this._ownerToken,
      ttlSeconds: this.ttlSeconds,
      description: this.description,
      kind: WorkerLockKind.Worker,
    });

    if (!acquired) {
      console.warn(`[worker-lock] already held — skip: ${this._lockKey}`);
      return { skipped: true, reason: "locked" };
    }

    // Seed streak từ DB — `existing` đã đọc TRƯỚC tryAcquire (bước 1), tích luỹ
    // `failCount` liên tục qua các invocation thay vì reset mỗi lần (analysis §3 D4).
    // `existing == null` (worker chạy lần đầu, doc chưa tồn tại) → map rỗng, đã init ở trên.
    if (existing) {
      this.stalledTracker.seed(existing.stalledItems);
    }

    // ── Bước 3: Chạy business logic, capture error không throw ngay ──────
    // Linear flow: chạy → finalize meta → release → throw lại nếu có error.
    // Không dùng finally + silently vì khó đọc và che error thật sự.
    let error: unknown;
    let value: O | undefined;
    try {
      value = await this.runLocked(input);
    } catch (err) {
      error = err;
    }

    // ── Bước 4: Finalize + release — 1 DB call duy nhất ─────────────────
    // Ghi lastSuccessAt / lastError / stalledItems + clear ownerToken vào cùng 1 $set.
    // KHÔNG ghi cursor ở đây — cursor đã được `setCursor` persist liên tục
    // trong runLocked, tránh redundant write.
    try {
      await this.lockRepo.finalizeAndRelease(this._lockKey, this._ownerToken, {
        lastSuccessAt: error ? undefined : new Date().toISOString(),
        lastError: error ? truncateErrorMessage(error) : null,
        // Cap giữ item kẹt LÂU nhất (failCount cao) — item mới lỗi 1 lần ít giá trị điều tra.
        // LUÔN ghi mảng (kể cả rỗng): worker hồi phục hết ⇒ [] ⇒ ghi đè mảng cũ trên DB ⇒
        // tín hiệu tự tắt. Truyền undefined khi rỗng sẽ làm mảng cũ sống mãi (đúng defect D1).
        stalledItems: this.stalledTracker.snapshot(),
      });
    } catch (err) {
      console.warn(`[worker-lock] finalizeAndRelease failed: ${this._lockKey}`, err);
    }

    if (error) {
      throw error;
    }

    return value as O;
  }
}

/**
 * Coordinator cho **business-level distributed lock** xuyên qua nhiều process.
 *
 * Khác với {@link LockedWorkerUseCase} (single-invocation: acquire → run → release
 * trong cùng 1 Lambda), `BusinessLockCoordinator` phục vụ pattern **cross-process
 * lock** điển hình:
 *
 * - **BO API** (Next.js use case) `acquire()` lock → throw HTTP 409 nếu đang held.
 * - **Step Function** chạy nhiều Lambda → lock vẫn held xuyên các Lambda đó.
 * - **Finalize Lambda** `release()` lock cuối flow.
 * - **Crash recovery**: TTL hết → invocation sau takeover qua `tryAcquire`.
 *
 * Use case điển hình: `TriggerResettleUseCase` (BO API) acquire → Resettle SFN
 * chạy → Settle SFN (nested) chạy → `FinalizeSettleUseCase` release.
 *
 * ## Vì sao là 1 abstraction riêng?
 *
 * - `LockedWorkerUseCase` ép semantic "skip-if-locked" + cursor + kill-switch
 *   không phù hợp cho BO API (API phải fail-fast với HTTP error, không "skip").
 * - Gọi trực tiếp `WorkerLockRepository` từ business layer làm **leak
 *   infrastructure detail** (`ownerToken`, `expiresAt`, `tryAcquire`) ra
 *   BO use case → 6 game khác sẽ copy-paste cùng pattern.
 * - Coordinator centralize: business layer chỉ thấy `acquire`/`release` semantic,
 *   không biết về `ownerToken` UUID hay `expiresAt` Date.
 *
 * ## Idempotency & ownership model
 *
 * - `acquire()` sinh `ownerToken` UUIDv7 mới mỗi lần — caller PHẢI propagate
 *   token này qua SFN context để `release()` dùng đúng owner.
 * - `release()` chỉ release nếu `ownerToken` match — KHÔNG release nhầm lock
 *   của owner khác (đã takeover sau TTL).
 * - Token mismatch → `released: false` → log warning, KHÔNG throw (lock sẽ
 *   tự takeover qua TTL ở lần sau, business state vẫn nhất quán).
 *
 * ## Crash semantics
 *
 * - BO API crash giữa `acquire()` và start SFN → lock held vô chủ → TTL hết
 *   → release tự động.
 * - SFN crash giữa chừng → cùng cơ chế.
 * - Caller PHẢI gọi `releaseOnRollback()` ở BO API nếu acquire OK nhưng
 *   start SFN/transition fail — tránh user phải đợi đủ TTL retry.
 *
 * @example BO API acquire
 * ```ts
 * const coordinator = new BusinessLockCoordinator();
 * const ownerToken = await coordinator.acquire({
 *   lockKey: `keno:resettle:${drawId}`,
 *   ttlSeconds: 300,
 *   heldErrorCode: "RESETTLE_LOCK_HELD",
 *   heldErrorMessage: `Kỳ quay ${drawId} đang được resettle bởi phiên khác.`,
 * });
 *
 * try {
 *   await drawRepo.triggerSettle(drawId);
 *   await startExecution({ ..., input: { drawId, lockOwnerToken: ownerToken, lockKey } });
 * } catch (err) {
 *   await coordinator.releaseOnRollback(lockKey, ownerToken, err);
 *   throw err;
 * }
 * ```
 *
 * @example Worker finalize release
 * ```ts
 * const coordinator = new BusinessLockCoordinator();
 * await coordinator.release({
 *   lockKey: resettleContext.lockKey,
 *   ownerToken: resettleContext.lockOwnerToken,
 * });
 * ```
 */

import { AppException } from "@megawin/shared/errors";
import { generateId, truncateErrorMessage } from "@megawin/shared/utils";

import { WorkerLockRepository } from "../infras/repos";

export interface AcquireBusinessLockOptions {
  /**
   * Lock key — convention `"{game}:{operation}:{resourceId}"`.
   *
   * VD: `"keno:resettle:2026-03-07.001"`, `"mega645:resettle:2026-03-07"`.
   */
  lockKey: string;

  /**
   * TTL (giây) — thời gian lock được giữ trước khi auto-expire.
   *
   * Set = thời gian tối đa của business operation (e.g. cả phiên SFN chạy xong).
   * KHÔNG cần buffer — TTL chỉ là safety net cho crash, release bình thường
   * không phụ thuộc TTL.
   */
  ttlSeconds: number;

  /**
   * Mã lỗi business code cho HTTP 409 — VD: `"RESETTLE_LOCK_HELD"`.
   * Caller định nghĩa để map sang error code của hệ thống.
   */
  heldErrorCode: string;

  /**
   * Message hiển thị cho người dùng cuối khi acquire fail. Nên gợi ý hành động
   * (đợi bao lâu, liên hệ ai) thay vì chỉ báo lỗi kỹ thuật.
   */
  heldErrorMessage: string;
}

export interface ReleaseBusinessLockOptions {
  /** Lock key đã propagate qua context (e.g. SFN input). */
  lockKey: string;

  /** Owner token đã propagate qua context — chỉ release nếu match. */
  ownerToken: string;

  /**
   * Nếu business operation thất bại, truyền error vào — coordinator sẽ ghi
   * `lastError` vào lock doc để monitoring trace lỗi cuối cùng.
   *
   * Bỏ trống → ghi `lastSuccessAt = now`, `lastError = null`.
   */
  error?: unknown;
}

/**
 * Coordinator cho cross-process business lock. Stateless — có thể tái sử dụng
 * 1 instance cho nhiều operation, hoặc tạo mới mỗi lần dùng (cost negligible).
 */
export class BusinessLockCoordinator {
  constructor(private readonly lockRepo: WorkerLockRepository = new WorkerLockRepository()) {}

  /**
   * Acquire lock ở BO API. Throw {@link AppException} với `heldErrorCode` +
   * `heldErrorMessage` nếu lock đang held bởi owner khác (chưa hết TTL) — caller
   * (Next.js route handler) tự render thành HTTP 409 qua middleware mặc định.
   *
   * Trả `ownerToken` UUIDv7 — caller PHẢI propagate qua SFN context để
   * `release()` sau dùng đúng owner.
   *
   * Atomic — sử dụng `WorkerLockRepository.tryAcquire` (1 DB round-trip,
   * upsert + unique index chặn race).
   */
  async acquire(opts: AcquireBusinessLockOptions): Promise<string> {
    const ownerToken = generateId();
    const acquired = await this.lockRepo.tryAcquire({
      lockKey: opts.lockKey,
      ownerToken,
      ttlSeconds: opts.ttlSeconds,
    });

    if (!acquired) {
      throw new AppException(opts.heldErrorCode, opts.heldErrorMessage);
    }

    return ownerToken;
  }

  /**
   * Release lock ở finalize step (worker Lambda).
   *
   * Chỉ release nếu `ownerToken` match — không bao giờ release nhầm lock của
   * owner khác (đã takeover sau TTL hết).
   *
   * KHÔNG throw nếu release fail (token mismatch hoặc DB error) — lock state
   * inconsistent là vấn đề monitoring, không nên block business finalize.
   * Lock sẽ tự takeover qua TTL ở lần sau.
   *
   * Returns `true` nếu release thành công, `false` nếu token mismatch hoặc
   * lock đã bị takeover.
   */
  async release(opts: ReleaseBusinessLockOptions): Promise<boolean> {
    const { lockKey, ownerToken, error } = opts;

    try {
      const released = await this.lockRepo.finalizeAndRelease(lockKey, ownerToken, {
        lastSuccessAt: error ? undefined : new Date().toISOString(),
        lastError: error ? truncateErrorMessage(error) : null,
      });

      if (!released) {
        console.warn(
          `[business-lock] release failed: lockKey=${lockKey} ownerToken=${ownerToken} — ` +
            `có thể đã bị takeover sau TTL hết hoặc owner sai.`,
        );
      }

      return released;
    } catch (err) {
      console.warn(`[business-lock] release error: lockKey=${lockKey}`, err);
      return false;
    }
  }

  /**
   * Rollback helper cho BO API — gọi khi đã `acquire()` OK nhưng các bước sau
   * (transition status, start SFN) thất bại.
   *
   * Wrap `release` + log error rollback — caller chỉ cần 1 dòng:
   *
   * ```ts
   * try {
   *   await drawRepo.triggerSettle(drawId);
   *   await startExecution(...);
   * } catch (err) {
   *   await coordinator.releaseOnRollback(lockKey, ownerToken, err);
   *   throw err;
   * }
   * ```
   *
   * KHÔNG throw — luôn để caller throw error gốc.
   */
  async releaseOnRollback(lockKey: string, ownerToken: string, error: unknown): Promise<void> {
    await this.release({ lockKey, ownerToken, error });
  }
}

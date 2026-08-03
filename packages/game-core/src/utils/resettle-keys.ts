import type { GameProduct } from "../entities";

/**
 * Convention build các string key liên quan đến phiên resettle.
 *
 * SINGLE SOURCE OF TRUTH cho format `{game}:resettle:...` xuyên hệ thống —
 * lock key (DistributedMutex) và batchKey (tenant_dispatch_orders).
 *
 * ## Vì sao centralize ở `game-core/utils`?
 *
 * Trước đây format này hard-code rải rác trong:
 *   - `TriggerResettleUseCase` (BO API): build lockKey để acquire lock.
 *   - `FinalizeSettleUseCase` (worker): build lockKey để release lock.
 *   - `EnqueueDispatchPayoutsUseCase` (settle path resettle): build batchKey payout.
 *   - `EnqueueReversalsUseCase` (resettle path): build batchKey reversal.
 *   - JSDoc trong `ResettleContext` types: nhắc convention.
 *
 * Mỗi game × 4-5 chỗ × 7 game = 28-35 chỗ. Sửa convention sẽ phải grep + sửa
 * thủ công, **dễ miss** → acquire ≠ release format → lock không release đúng,
 * chỉ được TTL release sau 5 phút (silent bug, business state OK nhưng latency).
 *
 * Centralize ở đây = đổi convention = sửa **đúng 1 file**.
 *
 * ## Tại sao thuộc `game-core` chứ không phải `worker-core`?
 *
 * `worker-core` là infrastructure (lock repo, locked worker base class) —
 * KHÔNG biết về game-specific naming convention. `game-core` mới là nơi định
 * nghĩa `GameProduct` enum và shared game-domain rules → đặt ở đây phù hợp
 * separation of concerns.
 */

/**
 * Build lock key chuẩn cho phiên resettle.
 *
 * Convention: `"{game}:resettle:{drawId}"`.
 *
 * Lock key này dùng bởi {@link DistributedMutex} để chống double-trigger
 * resettle cho cùng 1 draw — `TriggerResettle` (BO API) acquire, `FinalizeSettle`
 * (worker SFN) release.
 *
 * @param game - Mã game ({@link GameProduct} enum value).
 * @param drawId - DrawId format `YYYY-MM-DD.NNN` (vd: `"2026-03-07.001"`).
 *
 * @example
 * ```ts
 * const lockKey = buildResettleLockKey(GameProduct.Bingo18, "2026-03-07.001");
 * // → "bingo18:resettle:2026-03-07.001"
 * ```
 */
export function buildResettleLockKey(game: GameProduct, drawId: string): string {
  return `${game}:resettle:${drawId}`;
}

/**
 * Loại dispatch order trong phiên resettle.
 *
 * - `reversal` — reversal đảo ngược payout phiên settle cũ (ghi outbox bởi
 *   `EnqueueReversalsUseCase`, gửi đi trước payout mới).
 * - `payout` — payout mới của phiên resettle (ghi outbox bởi
 *   `EnqueueDispatchPayoutsUseCase` khi `resettleContext` present).
 */
export type ResettleBatchKind = "reversal" | "payout";

/**
 * Build batchKey cho dispatch orders thuộc phiên resettle.
 *
 * Convention: `"{game}:resettle:{drawId}:{resettleId}:{kind}"`.
 *
 * BatchKey này tag vào `TenantDispatchOrderDoc.batchKey` để tenant-dispatch
 * worker poll outbox theo batch và monitor progress phiên resettle.
 *
 * @param game - Mã game ({@link GameProduct} enum value).
 * @param drawId - DrawId format `YYYY-MM-DD.NNN`.
 * @param resettleId - UUIDv7 sinh tại BO API `TriggerResettle`, session key xuyên SFN.
 * @param kind - `"reversal"` cho enqueue đảo ngược, `"payout"` cho payout mới.
 *
 * @example
 * ```ts
 * const reversalBatchKey = buildResettleBatchKey(
 *   GameProduct.Keno,
 *   "2026-03-07.045",
 *   "01919b8f-...",
 *   "reversal",
 * );
 * // → "keno:resettle:2026-03-07.045:01919b8f-...:reversal"
 * ```
 */
export function buildResettleBatchKey(
  game: GameProduct,
  drawId: string,
  resettleId: string,
  kind: ResettleBatchKind,
): string {
  return `${game}:resettle:${drawId}:${resettleId}:${kind}`;
}

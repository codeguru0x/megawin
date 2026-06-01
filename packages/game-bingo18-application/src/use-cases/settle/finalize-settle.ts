/**
 * Use Case: Finalize Settle (Bingo 18)
 *
 * Bước cuối: chuyển draw `Settling → Settled` (atomic, idempotent).
 * Bingo 18 KHÔNG có Jackpot → không cần propagate jackpot.
 *
 * RESETTLE PATH:
 * - `resettleContext` present → release business lock (`bingo18:resettle:{drawId}`)
 *   qua `BusinessLockCoordinator` với đúng `lockOwnerToken` (tránh release nhầm
 *   khi TTL hết và owner mới đã takeover).
 * - Coordinator trả `false` (lock đã bị takeover hoặc owner sai) → coordinator
 *   tự log warning, KHÔNG fail SFN: phiên resettle đã hoàn tất nội dung; lock
 *   state inconsistent là vấn đề monitoring, không nên block finalize.
 * - **KHÔNG** clear `reversal` field. Field giữ lại làm audit trail của phiên
 *   resettle GẦN NHẤT (resettleId, reversalTx, reversalAmount cũ). CS/forensic
 *   query trực tiếp trên entry doc thay vì join với `tenant_dispatch_orders`.
 *   Phiên resettle kế tiếp tự overwrite hoặc wipe field qua `PrepareResettle`
 *   step 1 — đảm bảo correctness mà không cần wipe ở finalize. Xem JSDoc
 *   `EntryReversal` cho semantic kép (dispatch payload vs audit snapshot).
 *
 * CRASH-SAFE: transitionStatus atomic, idempotent.
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import { AppException } from "@megawin/shared/errors";
import { BusinessLockCoordinator } from "@megawin/worker-core";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { SettleContext } from "./types";

export interface FinalizeSettleResult {
  /** ID kỳ quay. */
  drawId: string;
  /** Trạng thái sau khi finalize (settled). */
  status: string;
  /** Thời điểm hoàn tất settle (ISO 8601). */
  completedAt: string;
}

export class FinalizeSettleUseCase extends InternalUseCase<SettleContext, FinalizeSettleResult> {
  private readonly drawRepo = new DrawRepository();
  private readonly lockCoordinator = new BusinessLockCoordinator();

  /** Chuyển draw settling → settled (atomic, idempotent). */
  protected async execute(input: SettleContext): Promise<FinalizeSettleResult> {
    const { drawId, resettleContext } = input;
    const updated = await this.drawRepo.settleComplete(drawId);

    if (!updated) {
      const draw = await this.drawRepo.getDrawById(drawId);

      if (draw?.status === DrawStatus.Settled) {
        // Replay sau crash — đã transition rồi, OK.
        console.log(`Draw ${drawId} already settled, skipping transition.`);
      } else {
        throw AppException.internal(
          `Cannot finalize draw ${drawId}. Current status: ${draw?.status}`,
        );
      }
    }

    // Release business lock CHỈ khi nested settle từ resettle path.
    // Settle lần đầu không acquire lock → không cần release.
    //
    // KHÔNG clear `reversal` field ở đây — giữ làm audit trail của phiên
    // resettle gần nhất (xem JSDoc `EntryReversal`). Phiên resettle KẾ TIẾP
    // sẽ overwrite via `bulkSetReversal` (entries thắng cả 2 phiên) hoặc
    // wipe sạch via `clearReversalSnapshot` ở `PrepareResettle` step 1
    // (entries thắng phiên cũ nhưng KHÔNG thắng phiên mới — tránh re-enqueue
    // reversal cũ).
    if (resettleContext) {
      // Coordinator đã handle: log warning nếu released = false, không throw
      // nếu DB error — finalize không bị block bởi lock state inconsistent.
      // `lockKey` propagate từ TriggerResettleUseCase qua SFN context — generic
      // (không phụ thuộc GameProduct cụ thể). Single source of truth ở
      // `buildResettleLockKey` trong `@megawin/game-core/utils`.
      await this.lockCoordinator.release({
        lockKey: resettleContext.lockKey,
        ownerToken: resettleContext.lockOwnerToken,
      });
    }

    return {
      drawId,
      status: DrawStatus.Settled,
      completedAt: new Date().toISOString(),
    };
  }
}

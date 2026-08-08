/**
 * Use Case: Finalize Settle (Max 3D)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * STEP 6 TRONG SETTLE FLOW (BƯỚC CUỐI TRƯỚC DISPATCH PAYOUTS)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Bước cuối cùng trong settle flow:
 *   1. Chuyển draw: settling → settled (atomic, idempotent)
 *
 * Max 3D không có Jackpot tích lũy → không cần:
 *   - Ghi jackpot snapshot
 *   - Cập nhật / đóng jackpot cycle
 *
 * RESETTLE PATH:
 * - `resettleContext` present → release business lock (`max3d:resettle:{drawId}`)
 *   qua `DistributedMutex` với đúng `lockOwnerToken` (tránh release nhầm
 *   khi TTL hết và owner mới đã takeover).
 * - Coordinator trả `false` (lock đã bị takeover hoặc owner sai) → coordinator
 *   tự log warning, KHÔNG fail SFN: phiên resettle đã hoàn tất nội dung; lock
 *   state inconsistent là vấn đề monitoring, không nên block finalize.
 * - **KHÔNG** clear `reversal` field. Field giữ lại làm audit trail của phiên
 *   resettle GẦN NHẤT (resettleId, reversalTx, reversalAmount cũ).
 *
 * CRASH-SAFE:
 *   - transitionStatus atomic: settling → settled
 *   - Nếu draw đã settled → skip (không throw)
 */

import { AppException, InternalUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import { DistributedMutex } from "@megawin/worker-core/locks";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { SettleContext } from "./types";

export interface FinalizeSettleResult {
  /** Mã kỳ quay. */
  drawId: string;
  /** Trạng thái sau khi finalize (settled). */
  status: string;
  /** Thời điểm hoàn tất settle (ISO 8601). */
  completedAt: string;
}

export class FinalizeSettleUseCase extends InternalUseCase<SettleContext, FinalizeSettleResult> {
  private readonly drawRepo = new DrawRepository();
  private readonly lockCoordinator = new DistributedMutex();

  protected async execute(input: SettleContext): Promise<FinalizeSettleResult> {
    const { drawId, resettleContext } = input;

    const updated = await this.drawRepo.settleComplete(drawId);

    if (!updated) {
      const draw = await this.drawRepo.getDrawById(drawId);

      if (draw?.status === DrawStatus.Settled) {
        console.log(`Draw ${drawId} already settled, skipping transition.`);
      } else {
        throw AppException.internal(`Cannot finalize draw ${drawId}. Current status: ${draw?.status}`);
      }
    }

    // Release business lock CHỈ khi nested settle từ resettle path.
    // Settle lần đầu không acquire lock → không cần release.
    if (resettleContext) {
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

/**
 * Use Case: Finalize Settle (Max 3D Pro)
 *
 * Bước cuối cùng trong settle flow:
 *   1. Chuyển draw: settling → settled (atomic, idempotent)
 *
 * Max 3D Pro không có Jackpot tích lũy → không cần:
 *   - Ghi jackpot snapshot
 *   - Cập nhật / đóng jackpot cycle
 *
 * CRASH-SAFE:
 *   - transitionStatus atomic: settling → settled
 *   - Nếu draw đã settled → skip (không throw)
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";

export interface FinalizeSettleInput {
  /** ID kỳ quay cần finalize. */
  drawId: string;
}

export interface FinalizeSettleResult {
  /** ID kỳ quay. */
  drawId: string;
  /** Trạng thái sau khi finalize (settled). */
  status: string;
  /** Thời điểm hoàn tất settle (ISO 8601). */
  completedAt: string;
}

export class FinalizeSettleUseCase extends InternalUseCase<
  FinalizeSettleInput,
  FinalizeSettleResult
> {
  private readonly drawRepo = new DrawRepository();

  protected async execute(
    input: FinalizeSettleInput
  ): Promise<FinalizeSettleResult> {
    const { drawId } = input;

    const updated = await this.drawRepo.transitionStatus(
      drawId,
      DrawStatus.Settling,
      DrawStatus.Settled
    );

    if (!updated) {
      const draw = await this.drawRepo.getDrawById(drawId);
      if (draw?.status === DrawStatus.Settled) {
        console.log(`Draw ${drawId} already settled, skipping transition.`);
      } else {
        throw new Error(
          `Cannot finalize draw ${drawId}. Current status: ${draw?.status}`
        );
      }
    }

    return {
      drawId,
      status: DrawStatus.Settled,
      completedAt: new Date().toISOString(),
    };
  }
}

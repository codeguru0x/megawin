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
 * CRASH-SAFE:
 *   - transitionStatus atomic: settling → settled
 *   - Nếu draw đã settled → skip (không throw)
 */

import { AppException, InternalUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { SettleContextWithFinancials } from "./types";

export interface FinalizeSettleResult {
  /** Mã kỳ quay. */
  drawId: string;
  /** Trạng thái sau khi finalize (settled). */
  status: string;
  /** Thời điểm hoàn tất settle (ISO 8601). */
  completedAt: string;
}

export class FinalizeSettleUseCase extends InternalUseCase<
  SettleContextWithFinancials,
  FinalizeSettleResult
> {
  private readonly drawRepo = new DrawRepository();

  protected async execute(input: SettleContextWithFinancials): Promise<FinalizeSettleResult> {
    const { drawId } = input;

    const updated = await this.drawRepo.settleComplete(drawId);

    if (!updated) {
      const draw = await this.drawRepo.getDrawById(drawId);

      if (draw?.status === DrawStatus.Settled) {
        console.log(`Draw ${drawId} already settled, skipping transition.`);
      } else {
        throw AppException.internal(
          `Cannot finalize draw ${drawId}. Current status: ${draw?.status}`,
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

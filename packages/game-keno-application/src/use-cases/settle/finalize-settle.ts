/**
 * Use Case: Finalize Settle (Keno)
 *
 * Bước cuối: chuyển draw settling → settled.
 * Keno KHÔNG có Jackpot → không cần propagate jackpot.
 *
 * CRASH-SAFE: transitionStatus atomic, idempotent.
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";

export interface FinalizeSettleInput {
  drawId: string;
}

export interface FinalizeSettleResult {
  drawId: string;
  status: string;
  completedAt: string;
}

export class FinalizeSettleUseCase extends InternalUseCase<
  FinalizeSettleInput,
  FinalizeSettleResult
> {
  private readonly drawRepo = new DrawRepository();

  /** Chuyển draw settling → settled (atomic, idempotent). */
  protected async execute(input: FinalizeSettleInput): Promise<FinalizeSettleResult> {
    const { drawId } = input;
    const updated = await this.drawRepo.transitionStatus(
      drawId,
      DrawStatus.Settling,
      DrawStatus.Settled,
    );

    if (!updated) {
      const draw = await this.drawRepo.getDrawById(drawId);
      if (draw?.status === DrawStatus.Settled) {
        console.log(`Draw ${drawId} already settled, skipping transition.`);
      } else {
        throw new Error(
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

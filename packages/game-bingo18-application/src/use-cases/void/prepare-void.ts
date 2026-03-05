/**
 * Use Case: Prepare Void (Bingo 18)
 *
 * Step 1 của Void Draw Step Function.
 * Verify draw đã ở status voiding (do void-draw API đã transition).
 * Load context: draw info.
 *
 * IDEMPOTENT: chỉ đọc, không ghi.
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";

export interface PrepareVoidInput {
  drawId: string;
}

export interface PrepareVoidResult {
  drawId: string;
  drawDate: string;
  drawNo: number;
}

export class PrepareVoidUseCase extends InternalUseCase<PrepareVoidInput, PrepareVoidResult> {
  private readonly drawRepo = new DrawRepository();

  protected async execute(input: PrepareVoidInput): Promise<PrepareVoidResult> {
    const { drawId } = input;
    const draw = await this.drawRepo.getDrawById(drawId);
    if (!draw) {
      throw new Error(`Draw ${drawId} không tồn tại.`);
    }

    if (draw.status !== DrawStatus.Voiding) {
      throw new Error(`Draw ${drawId} status = "${draw.status}" – expected "voiding".`);
    }

    return {
      drawId,
      drawDate: draw.drawDate,
      drawNo: draw.drawNo,
    };
  }
}

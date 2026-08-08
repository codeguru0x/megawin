/**
 * Use Case: Prepare Void (Keno)
 *
 * Step 1 của Void Draw Step Function.
 * Verify draw đã ở status voiding (do void-draw API đã transition).
 * Load context: draw info.
 *
 * IDEMPOTENT: chỉ đọc, không ghi.
 */

import { AppException, InternalUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { VoidContext } from "./types";

export interface PrepareVoidInput {
  drawId: string;
}

export class PrepareVoidUseCase extends InternalUseCase<PrepareVoidInput, VoidContext> {
  private readonly drawRepo = new DrawRepository();

  protected async execute(input: PrepareVoidInput): Promise<VoidContext> {
    const { drawId } = input;
    const draw = await this.drawRepo.getDrawById(drawId);
    if (!draw) {
      throw AppException.notFound(`Draw ${drawId} không tồn tại.`);
    }

    if (draw.status !== DrawStatus.Voiding) {
      throw AppException.businessRuleViolation(`Draw ${drawId} status = "${draw.status}" – expected "voiding".`);
    }

    return {
      drawId,
      financialDate: draw.financialDate,
      drawDate: draw.drawDate,
      drawNo: draw.drawNo,
    };
  }
}

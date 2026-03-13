/**
 * Use Case: Prepare Void (Max 3D)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * STEP 1 TRONG VOID FLOW
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Verify draw đã ở status "voiding" (do void-draw API đã transition trước đó).
 * Load context cần thiết cho void flow.
 *
 * OUTPUT (truyền cho tất cả steps sau qua $voidCtx):
 *   { drawId, drawDate, drawNo }
 *
 * IDEMPOTENT: chỉ đọc, không ghi.
 * CRASH-SAFE: retry safe — chỉ validate + return context.
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
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
      throw new Error(`Draw ${drawId} không tồn tại.`);
    }

    if (draw.status !== DrawStatus.Voiding) {
      throw new Error(`Draw ${drawId} status = "${draw.status}" – expected "voiding".`);
    }

    return {
      drawId,
      drawDate: draw.drawDate,
      drawNo: draw.drawNo,
      financialDate: draw.financialDate,
    };
  }
}

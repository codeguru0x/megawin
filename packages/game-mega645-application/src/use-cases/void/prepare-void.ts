/**
 * Use Case: Prepare Void (Mega 6/45)
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
import type { VoidContext } from "./types";
import { AppException } from "@megawin/shared/errors";

export interface PrepareVoidInput {
  drawId: string;
}

export class PrepareVoidUseCase extends InternalUseCase<PrepareVoidInput, VoidContext> {
  private readonly drawRepo = new DrawRepository();

  protected async execute(input: PrepareVoidInput): Promise<VoidContext> {
    const { drawId } = input;

    // Fetch draw để verify tồn tại và đang ở đúng status voiding.
    // void-draw API đã transition draw → voiding trước khi trigger Step Function.
    const draw = await this.drawRepo.getDrawById(drawId);
    if (!draw) {
      throw AppException.notFound(`Draw ${drawId} không tồn tại.`);
    }

    // Guard: chỉ chấp nhận status voiding. Nếu status khác (scheduled, void...)
    // → Step Function không nên chạy → throw để fail fast, tránh void nhầm draw.
    if (draw.status !== DrawStatus.Voiding) {
      throw AppException.businessRuleViolation(
        `Draw ${drawId} status = "${draw.status}" – expected "voiding".`,
      );
    }

    return {
      drawId,
      drawDate: draw.drawDate,
      drawNo: draw.drawNo,
    };
  }
}

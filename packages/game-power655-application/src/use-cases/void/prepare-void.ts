/**
 * Use Case: Prepare Void (Power 6/55)
 *
 * Step 1 của Void Draw Step Function.
 * Pipeline: **prepare-void** → void-entries → dispatch-refunds → finalize-void
 *
 * Verify draw đã ở status = voiding (void-draw API đã transition trước khi trigger
 * Step Function) và load context cần thiết cho các step tiếp theo.
 *
 * IDEMPOTENT: chỉ đọc từ DB, không ghi dữ liệu.
 * Nếu draw không ở status voiding → throw error → Step Function dừng ngay.
 *
 * PRE-CONDITION:
 *   - Draw phải tồn tại trong DB
 *   - Draw status phải = "voiding" (chuyển bởi void-draw API)
 *
 * POST-CONDITION:
 *   - Trả về VoidContext { drawId, drawDate, drawNo } cho các step sau dùng
 */

import { AppException, InternalUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";

import { DrawRepository } from "../../infras/repos/draw-repo";
import type { VoidContext } from "./types";

export interface PrepareVoidInput {
  /** ID kỳ quay cần void. */
  drawId: string;
}

/**
 * Validate draw status và load context cho void pipeline.
 *
 * @param input.drawId - ID kỳ quay cần void
 * @returns VoidContext chứa drawId, drawDate, drawNo, financialDate → truyền qua Step Function state
 * @throws Error nếu draw không tồn tại hoặc status ≠ voiding
 */
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
      drawDate: draw.drawDate,
      drawNo: draw.drawNo,
      financialDate: draw.financialDate,
    };
  }
}

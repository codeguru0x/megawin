/**
 * Use Case: Prepare Void (Power 6/55)
 *
 * Step 1 của Void Draw Step Function.
 * Validate draw ở trạng thái cho phép void và transition → void.
 *
 * Quy tắc:
 *   - Draw PHẢI ở trạng thái "salesClosed" hoặc "published".
 *   - Draw đã settled hoặc đang settling KHÔNG được void.
 *
 * IDEMPOTENT: transition atomic.
 */

import { StepFunctionUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";

export interface PrepareVoidInput {
  /** ID kỳ quay cần huỷ (void). */
  drawId: string;
  /** Lý do huỷ kỳ quay. */
  reason: string;
  /** ID người thực hiện huỷ (admin/operator). */
  voidedBy?: string;
}

export interface PrepareVoidResult {
  /** ID kỳ quay đã chuyển sang trạng thái void. */
  drawId: string;
  /** Ngày quay, định dạng YYYY-MM-DD. */
  drawDate: string;
  /** Số thứ tự kỳ quay. */
  drawNo: number;
  /** Lý do huỷ. */
  reason: string;
  /** ID người thực hiện huỷ. */
  voidedBy?: string;
  /** Trạng thái trước khi huỷ (salesClosed / published). */
  previousStatus: string;
  /** Tổng số entries có thể void (status: scheduled/active/drawn). */
  totalVoidableEntries: number;
}

/**
 * Validate draw + transition → void cho Power 6/55.
 * Throw nếu draw không ở trạng thái hợp lệ.
 */
export class PrepareVoidUseCase extends StepFunctionUseCase<
  PrepareVoidInput,
  PrepareVoidResult
> {
  private readonly drawRepo = new DrawRepository();
  private readonly entryRepo = new EntryRepository();

  /** @inheritdoc */
  protected async execute(
    input: PrepareVoidInput
  ): Promise<PrepareVoidResult> {
    const { drawId, reason, voidedBy } = input;
    const draw = await this.drawRepo.getDrawById(drawId);
    if (!draw) {
      throw new Error(`Draw ${drawId} không tồn tại.`);
    }

    const VOIDABLE_STATUSES = new Set([
      DrawStatus.SalesClosed,
      DrawStatus.Published,
    ]);

    if (!VOIDABLE_STATUSES.has(draw.status as any)) {
      throw new Error(
        `Draw ${drawId} status = "${draw.status}" – chỉ void được khi ở salesClosed/published.`
      );
    }

    const updated = await this.drawRepo.voidDraw(drawId, draw.status, {
      reason,
      voidedBy,
      voidedAt: new Date(),
    });

    if (!updated) {
      throw new Error(
        `Draw ${drawId} transition → void thất bại (race condition).`
      );
    }

    const totalVoidableEntries =
      await this.entryRepo.countVoidableEntries(drawId);

    return {
      drawId,
      drawDate: draw.drawDate,
      drawNo: draw.drawNo,
      reason,
      voidedBy,
      previousStatus: draw.status,
      totalVoidableEntries,
    };
  }
}

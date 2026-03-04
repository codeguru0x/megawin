/**
 * Use Case: Prepare Void (Keno)
 *
 * Step 1 của Void Draw Step Function.
 * Validate draw cho phép void (salesClosed/published), transition → void.
 * Load context: draw info, tổng entries cần void.
 *
 * IDEMPOTENT: chỉ đọc sau khi transition.
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";

export interface PrepareVoidInput {
  drawId: string;
  reason: string;
  voidedBy?: string;
}

export interface PrepareVoidResult {
  drawId: string;
  drawDate: string;
  drawNo: number;
  reason: string;
  voidedBy?: string;
  previousStatus: string;
  totalVoidableEntries: number;
}

export class PrepareVoidUseCase extends InternalUseCase<
  PrepareVoidInput,
  PrepareVoidResult
> {
  private readonly drawRepo = new DrawRepository();
  private readonly entryRepo = new EntryRepository();

  protected async execute(input: PrepareVoidInput): Promise<PrepareVoidResult> {
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

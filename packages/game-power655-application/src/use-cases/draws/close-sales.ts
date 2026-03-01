import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DrawStatus, EntryStatus } from "@megawin/game-core/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import type { DrawIdInput, DrawTransitionOutput } from "./dto/draw.dto";

/**
 * Đóng bán vé cho 1 kỳ quay Power 6/55.
 * Transition: salesOpen → salesClosed.
 *
 * Side effect:
 * - Batch transition entries: scheduled → active
 */
export class CloseSalesUseCase extends NextApiUseCase<
  DrawIdInput,
  DrawTransitionOutput
> {
  private readonly drawRepo = new DrawRepository();
  private readonly entryRepo = new EntryRepository();

  /** @inheritdoc */
  protected async execute(input: DrawIdInput): Promise<DrawTransitionOutput> {
    const updated = await this.drawRepo.transitionStatus(
      input.drawId,
      DrawStatus.SalesOpen,
      DrawStatus.SalesClosed
    );

    if (!updated) {
      const draw = await this.drawRepo.getDrawById(input.drawId);
      if (!draw) {
        throw AppException.notFound(`Kỳ quay ${input.drawId} không tồn tại.`);
      }
      throw new AppException(
        "DRAW_INVALID_TRANSITION",
        `Không thể đóng bán – draw hiện tại ở trạng thái "${draw.status}".`
      );
    }

    await this.entryRepo.batchTransitionByDrawId(
      input.drawId,
      EntryStatus.Scheduled,
      EntryStatus.Active
    );

    return {
      drawId: input.drawId,
      previousStatus: DrawStatus.SalesOpen,
      currentStatus: DrawStatus.SalesClosed,
    };
  }
}

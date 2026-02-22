import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import {
  Lotto535DrawStatus,
  Lotto535EntryStatus,
} from "@megawin/game-lotto535/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import type { DrawIdInput, DrawTransitionOutput } from "./dto/draw.dto";

/**
 * Đóng bán vé cho 1 kỳ quay.
 * Transition: salesOpen -> salesClosed.
 *
 * Side effect:
 * - Batch transition entries: scheduled -> active
 * - Update draw stats (ticketEntryCount, totalLineCount, totalSalesAmount)
 */
export class CloseSalesUseCase extends NextApiUseCase<
  DrawIdInput,
  DrawTransitionOutput
> {
  protected async execute(input: DrawIdInput): Promise<DrawTransitionOutput> {
    const drawRepo = new DrawRepository();
    const entryRepo = new EntryRepository();

    const updated = await drawRepo.transitionStatus(
      input.drawId,
      Lotto535DrawStatus.SalesOpen,
      Lotto535DrawStatus.SalesClosed,
    );

    if (!updated) {
      const draw = await drawRepo.getDrawById(input.drawId);
      if (!draw) {
        throw AppException.notFound(`Kỳ quay ${input.drawId} không tồn tại.`);
      }
      throw new AppException(
        "DRAW_INVALID_TRANSITION",
        `Không thể đóng bán – draw hiện tại ở trạng thái "${draw.status}".`,
      );
    }

    await entryRepo.batchTransitionByDrawId(
      input.drawId,
      Lotto535EntryStatus.Scheduled,
      Lotto535EntryStatus.Active,
    );

    const [entryCount, totalLines, revenueData] = await Promise.all([
      entryRepo.countEntriesByDrawId(input.drawId),
      entryRepo.countLinesByDrawId(input.drawId),
      entryRepo.aggregateRevenueByTenant(input.drawId),
    ]);

    const totalSalesAmount = revenueData.reduce((s, r) => s + r.revenue, 0);

    await drawRepo.updateStats(input.drawId, {
      ticketEntryCount: entryCount,
      totalLineCount: totalLines,
      totalSalesAmount,
    });

    return {
      drawId: input.drawId,
      previousStatus: Lotto535DrawStatus.SalesOpen,
      currentStatus: Lotto535DrawStatus.SalesClosed,
    };
  }
}

import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DrawStatus } from "@megawin/game-core/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { DrawIdInput, DrawTransitionOutput } from "./dto/draw.dto";

/**
 * Đóng bán vé cho 1 kỳ quay.
 * Transition: salesOpen -> salesClosed.
 */
export class CloseSalesUseCase extends NextApiUseCase<
  DrawIdInput,
  DrawTransitionOutput
> {
  private readonly drawRepo = new DrawRepository();

  protected async execute(input: DrawIdInput): Promise<DrawTransitionOutput> {
    const updated = await this.drawRepo.closeSales(input.drawId, new Date());

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

    return {
      drawId: input.drawId,
      previousStatus: DrawStatus.SalesOpen,
      currentStatus: DrawStatus.SalesClosed,
    };
  }
}

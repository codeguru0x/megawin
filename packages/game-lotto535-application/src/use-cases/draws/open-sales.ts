import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { Lotto535DrawStatus } from "@megawin/game-lotto535/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { DrawIdInput, DrawTransitionOutput } from "./dto/draw.dto";

/**
 * Mở bán vé cho 1 kỳ quay.
 * Transition: scheduled -> salesOpen.
 * Validate: drawTime chưa qua.
 */
export class OpenSalesUseCase extends NextApiUseCase<
  DrawIdInput,
  DrawTransitionOutput
> {
  protected async execute(input: DrawIdInput): Promise<DrawTransitionOutput> {
    const drawRepo = new DrawRepository();

    const draw = await drawRepo.getDrawById(input.drawId);
    if (!draw) {
      throw AppException.notFound(`Kỳ quay ${input.drawId} không tồn tại.`);
    }

    if (draw.drawTime.getTime() < Date.now()) {
      throw AppException.badRequest(
        "Không thể mở bán – thời điểm quay đã qua.",
      );
    }

    const updated = await drawRepo.transitionStatus(
      input.drawId,
      Lotto535DrawStatus.Scheduled,
      Lotto535DrawStatus.SalesOpen,
    );

    if (!updated) {
      throw new AppException(
        "DRAW_INVALID_TRANSITION",
        `Không thể chuyển trạng thái: draw hiện tại không ở "scheduled".`,
      );
    }

    return {
      drawId: input.drawId,
      previousStatus: Lotto535DrawStatus.Scheduled,
      currentStatus: Lotto535DrawStatus.SalesOpen,
    };
  }
}

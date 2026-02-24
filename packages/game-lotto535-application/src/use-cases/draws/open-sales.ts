import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DrawStatus } from "@megawin/game-core/entities";
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
      DrawStatus.Scheduled,
      DrawStatus.SalesOpen,
    );

    if (!updated) {
      throw new AppException(
        "DRAW_INVALID_TRANSITION",
        `Không thể chuyển trạng thái: draw hiện tại không ở "scheduled".`,
      );
    }

    return {
      drawId: input.drawId,
      previousStatus: DrawStatus.Scheduled,
      currentStatus: DrawStatus.SalesOpen,
    };
  }
}

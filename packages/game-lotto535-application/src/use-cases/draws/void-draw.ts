import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DrawStatus } from "@megawin/game-core/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { DrawIdInput, DrawTransitionOutput } from "./dto/draw.dto";

const VOIDABLE_STATUSES = new Set<string>([
  DrawStatus.Scheduled,
  DrawStatus.SalesOpen,
  DrawStatus.SalesClosed,
  DrawStatus.Drawing,
]);

/**
 * Huỷ kỳ quay.
 *
 * Chỉ void được khi draw ở trạng thái: scheduled, salesOpen, salesClosed, drawing.
 * Sau khi published hoặc settling → KHÔNG void được (cần xử lý refund).
 */
export class VoidDrawUseCase extends NextApiUseCase<
  DrawIdInput,
  DrawTransitionOutput
> {
  protected async execute(input: DrawIdInput): Promise<DrawTransitionOutput> {
    const drawRepo = new DrawRepository();

    const draw = await drawRepo.getDrawById(input.drawId);
    if (!draw) {
      throw AppException.notFound(`Kỳ quay ${input.drawId} không tồn tại.`);
    }

    if (!VOIDABLE_STATUSES.has(draw.status)) {
      throw new AppException(
        "DRAW_INVALID_TRANSITION",
        `Không thể huỷ kỳ quay ở trạng thái "${draw.status}". Chỉ huỷ được khi ở scheduled/salesOpen/salesClosed/drawing.`,
      );
    }

    const updated = await drawRepo.transitionStatus(
      input.drawId,
      draw.status,
      DrawStatus.Void,
    );

    if (!updated) {
      throw AppException.internal("Huỷ kỳ quay thất bại – race condition.");
    }

    return {
      drawId: input.drawId,
      previousStatus: draw.status,
      currentStatus: DrawStatus.Void,
    };
  }
}

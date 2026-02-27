import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DrawStatus } from "@megawin/game-core/entities";
import { nowVN } from "@megawin/shared/utils/date";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { DrawIdInput, DrawTransitionOutput } from "./dto/draw.dto";

export class OpenSalesUseCase extends NextApiUseCase<
  DrawIdInput,
  DrawTransitionOutput
> {
  private readonly drawRepo = new DrawRepository();

  protected async execute(input: DrawIdInput): Promise<DrawTransitionOutput> {
    const draw = await this.drawRepo.getDrawById(input.drawId);
    if (!draw) {
      throw AppException.notFound(`Kỳ quay ${input.drawId} không tồn tại.`);
    }

    const allowedFrom: DrawStatus[] = [
      DrawStatus.Scheduled,
      DrawStatus.SalesClosed,
    ];
    if (!allowedFrom.includes(draw.status as DrawStatus)) {
      throw new AppException(
        "DRAW_INVALID_TRANSITION",
        `Không thể mở bán – draw hiện tại ở trạng thái "${draw.status}".`
      );
    }

    const updated = await this.drawRepo.openSales(
      input.drawId,
      draw.status,
      draw.sales.openAt ? undefined : nowVN()
    );

    if (!updated) {
      throw AppException.internal(
        `Không thể chuyển trạng thái draw ${input.drawId}. Vui lòng thử lại.`
      );
    }

    return {
      drawId: input.drawId,
      previousStatus: draw.status,
      currentStatus: DrawStatus.SalesOpen,
    };
  }
}

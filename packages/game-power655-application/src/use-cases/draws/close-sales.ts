import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DrawStatus } from "@megawin/game-core/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { auditCloseSales } from "../../services/audit-log";
import type { DrawTransitionInput, DrawTransitionOutput } from "./dto/draw.dto";

/**
 * Đóng bán vé cho 1 kỳ quay Power 6/55.
 * Transition: salesOpen → salesClosed.
 */
export class CloseSalesUseCase extends NextApiUseCase<DrawTransitionInput, DrawTransitionOutput> {
  private readonly drawRepo = new DrawRepository();

  /** @inheritdoc */
  protected async execute(input: DrawTransitionInput): Promise<DrawTransitionOutput> {
    const updated = await this.drawRepo.closeSales(input.drawId, new Date());

    if (!updated) {
      throw new AppException("DRAW_INVALID_TRANSITION", `Không thể đóng bán – vui lòng thử lại.`);
    }

    // Đóng bán chỉ hợp lệ từ SalesOpen (repo filter theo status) → prevStatus
    // chắc chắn là sales_open. Audit staff đóng bán — fire-and-forget.
    if (input.actor) {
      auditCloseSales({
        actor: input.actor,
        drawId: input.drawId,
        prevStatus: DrawStatus.SalesOpen,
      });
    }

    return {
      drawId: input.drawId,
      previousStatus: DrawStatus.SalesOpen,
      currentStatus: DrawStatus.SalesClosed,
    };
  }
}

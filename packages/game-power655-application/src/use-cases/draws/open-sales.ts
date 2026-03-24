/**
 * Use Case: Open Sales (Power 6/55)
 *
 * Mở bán vé cho 1 kỳ quay.
 *
 * Transition hợp lệ:
 *   - scheduled   → salesOpen  (lần đầu mở bán sau khi tạo kỳ)
 *   - salesClosed → salesOpen  (mở lại khi admin đóng sớm)
 *
 * Quy tắc:
 *   - Kỳ đã published/settling/settled KHÔNG mở lại được.
 *   - Kỳ đã void KHÔNG mở lại được.
 */

import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DrawStatus } from "@megawin/game-core/entities";
import { nowVN } from "@megawin/shared/utils";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { DrawIdInput, DrawTransitionOutput } from "./dto/draw.dto";

/**
 * Mở bán vé cho kỳ quay Power 6/55.
 * Cho phép chuyển từ scheduled hoặc salesClosed sang salesOpen.
 */
export class OpenSalesUseCase extends NextApiUseCase<
  DrawIdInput,
  DrawTransitionOutput
> {
  private readonly drawRepo = new DrawRepository();

  /** @inheritdoc */
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
        `Không thể mở bán – draw hiện tại ở trạng thái "${draw.status}". Chỉ mở bán từ "scheduled" hoặc "salesClosed".`
      );
    }

    const updated = await this.drawRepo.openSales(
      input.drawId,
      draw.status,
      !draw.sales.openAt ? nowVN() : undefined
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

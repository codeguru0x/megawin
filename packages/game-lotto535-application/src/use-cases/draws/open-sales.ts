/**
 * Use Case: Open Sales (Lotto 5/35)
 *
 * Mở (lại) bán vé cho 1 kỳ quay.
 * Transition: salesClosed → salesOpen.
 *
 * Dùng khi:
 *   - Admin đóng bán sớm nhưng muốn mở lại.
 *   - Kỳ quay chưa publish result hoặc settle.
 *
 * Quy tắc:
 *   - Chỉ cho phép mở lại từ salesClosed.
 *   - Kỳ đã published/settling/settled KHÔNG mở lại được.
 *   - Kỳ đã void KHÔNG mở lại được.
 */

import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DrawStatus } from "@megawin/game-core/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { DrawIdInput, DrawTransitionOutput } from "./dto/draw.dto";

export class OpenSalesUseCase extends NextApiUseCase<
  DrawIdInput,
  DrawTransitionOutput
> {
  private readonly drawRepo = new DrawRepository();

  /** Chuyển draw từ salesClosed → salesOpen. */
  protected async execute(input: DrawIdInput): Promise<DrawTransitionOutput> {
    const updated = await this.drawRepo.transitionStatus(
      input.drawId,
      DrawStatus.SalesClosed,
      DrawStatus.SalesOpen,
    );

    if (!updated) {
      const draw = await this.drawRepo.getDrawById(input.drawId);
      if (!draw) {
        throw AppException.notFound(`Kỳ quay ${input.drawId} không tồn tại.`);
      }
      throw new AppException(
        "DRAW_INVALID_TRANSITION",
        `Không thể mở bán lại – draw hiện tại ở trạng thái "${draw.status}". Chỉ mở lại từ "salesClosed".`,
      );
    }

    return {
      drawId: input.drawId,
      previousStatus: DrawStatus.SalesClosed,
      currentStatus: DrawStatus.SalesOpen,
    };
  }
}

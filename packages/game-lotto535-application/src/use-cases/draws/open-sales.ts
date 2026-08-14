/**
 * Use Case: Open Sales (Lotto 5/35)
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

import { UseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import { AppException } from "@megawin/shared/errors";
import { nowVN } from "@megawin/shared/utils";

import { DrawRepository } from "../../infras/repos/draw-repo";
import { auditOpenSales } from "../../services/audit-log";
import type { DrawTransitionInput, DrawTransitionOutput } from "./dto/draw.dto";

export class OpenSalesUseCase extends UseCase<DrawTransitionInput, DrawTransitionOutput> {
  private readonly drawRepo = new DrawRepository();

  protected async execute(input: DrawTransitionInput): Promise<DrawTransitionOutput> {
    const draw = await this.drawRepo.getDrawById(input.drawId);
    if (!draw) {
      throw AppException.notFound(`Kỳ quay ${input.drawId} không tồn tại.`);
    }

    const allowedFrom: DrawStatus[] = [DrawStatus.Scheduled, DrawStatus.SalesClosed];
    if (!allowedFrom.includes(draw.status as DrawStatus)) {
      throw new AppException(
        "DRAW_INVALID_TRANSITION",
        `Không thể mở bán – draw hiện tại ở trạng thái "${draw.status}". Chỉ mở bán từ "scheduled" hoặc "salesClosed".`,
      );
    }

    const updated = await this.drawRepo.openSales(input.drawId, draw.status, !draw.sales.openAt ? nowVN() : undefined);

    if (!updated) {
      throw AppException.internal(`Không thể chuyển trạng thái draw ${input.drawId}. Vui lòng thử lại.`);
    }

    // Audit staff mở bán — fire-and-forget, chỉ khi có actor (route BO truyền).
    if (input.actor) {
      auditOpenSales({ actor: input.actor, drawId: input.drawId, prevStatus: draw.status });
    }

    return {
      drawId: input.drawId,
      previousStatus: draw.status,
      currentStatus: DrawStatus.SalesOpen,
    };
  }
}

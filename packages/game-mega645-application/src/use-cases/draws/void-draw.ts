/**
 * Use Case: Void Draw (Mega 6/45)
 *
 * Huỷ kỳ quay từ backoffice.
 * Draw phải ở trạng thái: scheduled, salesClosed hoặc published.
 */

import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DrawStatus } from "@megawin/game-core/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { DrawIdInput, DrawTransitionOutput } from "./dto/draw.dto";

const VOIDABLE_STATUSES = new Set<string>([
  DrawStatus.Scheduled,
  DrawStatus.SalesClosed,
  DrawStatus.Published,
]);

export interface VoidDrawInput extends DrawIdInput {
  reason: string;
  voidedBy?: string;
}

export interface VoidDrawOutput extends DrawTransitionOutput {
  hasEntriesToVoid: boolean;
}

export class VoidDrawUseCase extends NextApiUseCase<
  VoidDrawInput,
  VoidDrawOutput
> {
  private readonly drawRepo = new DrawRepository();

  protected async execute(input: VoidDrawInput): Promise<VoidDrawOutput> {
    const draw = await this.drawRepo.getDrawById(input.drawId);
    if (!draw) {
      throw AppException.notFound(`Kỳ quay ${input.drawId} không tồn tại.`);
    }

    if (!VOIDABLE_STATUSES.has(draw.status)) {
      throw new AppException(
        "DRAW_INVALID_TRANSITION",
        `Không thể huỷ kỳ quay ở trạng thái "${draw.status}". ` +
          `Chỉ huỷ được khi ở scheduled/salesClosed/published.`
      );
    }

    const updated = await this.drawRepo.voidDraw(input.drawId, draw.status, {
      reason: input.reason,
      voidedBy: input.voidedBy,
      voidedAt: new Date(),
    });

    if (!updated) {
      throw AppException.internal("Huỷ kỳ quay thất bại – race condition.");
    }

    return {
      drawId: input.drawId,
      previousStatus: draw.status,
      currentStatus: DrawStatus.Void,
      hasEntriesToVoid: true,
    };
  }
}

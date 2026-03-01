/**
 * Use Case: Void Draw (Power 6/55 – Backoffice API)
 *
 * Huỷ kỳ quay từ backoffice.
 *
 * Quy tắc:
 *   - Draw phải ở trạng thái: scheduled, salesClosed, hoặc published.
 *   - Draw đã settled hoặc đang settling KHÔNG được void.
 *   - SalesOpen KHÔNG void trực tiếp – phải close sales trước.
 *
 * Flow:
 *   1. Validate draw status
 *   2. Transition draw → void (atomic)
 *   3. Trigger Void Step Function (async) để batch void entries + dispatch refunds
 *
 * UseCase này chỉ trigger transition – không xử lý entries.
 * Step Function (void worker) xử lý batch void + refund.
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
  /** true nếu có entries cần void (step function sẽ xử lý). */
  hasEntriesToVoid: boolean;
}

/**
 * Huỷ kỳ quay Power 6/55 từ backoffice.
 * Validate status + transition draw → void.
 */
export class VoidDrawUseCase extends NextApiUseCase<
  VoidDrawInput,
  VoidDrawOutput
> {
  private readonly drawRepo = new DrawRepository();

  /**
   * Validate + transition draw status → void.
   * Trả về thông tin để caller trigger step function.
   */
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

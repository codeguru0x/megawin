import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DrawStatus } from "@megawin/game-core/entities";
import { toExecutionName } from "@megawin/game-core/utils";
import { startExecution } from "@megawin/app-core/aws/sf";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { DrawIdInput, DrawTransitionOutput } from "./dto/draw.dto";

const VOID_SFN_ARN = process.env.MEGA645_VOID_SFN_ARN!;

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

/**
 * Huỷ kỳ quay Mega 6/45.
 *
 * Flow:
 *   1. Validate draw status (scheduled/salesClosed/published)
 *   2. Transition draw → void (atomic)
 *      - Nếu draw đã ở void (retry) → skip transition
 *   3. Start Void Step Function (deterministic name → idempotent)
 */
export class VoidDrawUseCase extends NextApiUseCase<VoidDrawInput, VoidDrawOutput> {
  private readonly drawRepo = new DrawRepository();

  protected async execute(input: VoidDrawInput): Promise<VoidDrawOutput> {
    const draw = await this.drawRepo.getDrawById(input.drawId);
    if (!draw) {
      throw AppException.notFound(`Kỳ quay ${input.drawId} không tồn tại.`);
    }

    const alreadyVoiding = draw.status === DrawStatus.Voiding || draw.status === DrawStatus.Void;

    if (!alreadyVoiding) {
      if (!VOIDABLE_STATUSES.has(draw.status)) {
        throw new AppException(
          "DRAW_INVALID_TRANSITION",
          `Không thể huỷ kỳ quay ở trạng thái "${draw.status}". ` +
            `Chỉ huỷ được khi ở scheduled/salesClosed/published.`,
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
    }

    try {
      await startExecution({
        stateMachineArn: VOID_SFN_ARN,
        name: toExecutionName(input.drawId),
        input: { drawId: input.drawId },
      });
    } catch (err) {
      throw new AppException(
        "SFN_START_FAILED",
        `Không thể khởi chạy void worker: ${(err as Error).message}`,
      );
    }

    return {
      drawId: input.drawId,
      previousStatus: alreadyVoiding ? draw.status : draw.status,
      currentStatus: DrawStatus.Voiding,
      hasEntriesToVoid: true,
    };
  }
}

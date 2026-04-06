import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DrawStatus } from "@megawin/game-core/entities";
import { toExecutionName } from "@megawin/game-core/utils";
import { startExecution } from "@megawin/app-core/aws/sf";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { TriggerSettleInput, TriggerSettleOutput } from "./dto/draw.dto";
import { logError } from "@megawin/shared/utils";

/**
 * Kết sổ kỳ quay Max 3D Pro.
 *
 * Flow:
 *   1. Validate draw (tồn tại, có result)
 *   2. Transition status: published → settling (atomic)
 *      - Nếu draw đã ở settling (retry) → skip transition
 *   3. Start Settle Step Function (deterministic name → idempotent)
 *
 * Max 3D Pro không có Jackpot tích lũy → không cần check split cycle.
 */
export class TriggerSettleUseCase extends NextApiUseCase<TriggerSettleInput, TriggerSettleOutput> {
  private readonly drawRepo = new DrawRepository();

  protected async execute(input: TriggerSettleInput): Promise<TriggerSettleOutput> {
    const draw = await this.drawRepo.getDrawById(input.drawId);
    if (!draw) {
      throw AppException.notFound(`Kỳ quay ${input.drawId} không tồn tại.`);
    }

    if (!draw.result) {
      throw AppException.badRequest("Chưa có kết quả quay – phải publish result trước khi kết sổ.");
    }

    if (draw.status !== DrawStatus.Settling) {
      const updated = await this.drawRepo.triggerSettle(input.drawId);

      if (!updated) {
        throw new AppException(
          "DRAW_INVALID_TRANSITION",
          `Không thể kết sổ – draw hiện tại không ở trạng thái "published".`,
        );
      }
    }

    try {
      await startExecution({
        stateMachineArn: input.SETTLE_SFN_ARN,
        name: toExecutionName(input.drawId),
        input: { drawId: input.drawId },
      });
    } catch (err) {
      logError("TriggerSettle", err, { drawId: input.drawId });
      throw new AppException("SFN_START_FAILED", `Không thể khởi chạy settle worker`);
    }

    return {
      drawId: input.drawId,
      status: DrawStatus.Settling,
    };
  }
}

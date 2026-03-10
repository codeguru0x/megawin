import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DrawStatus } from "@megawin/game-core/entities";
import { toExecutionName } from "@megawin/game-core/utils";
import { startExecution } from "@megawin/app-core/aws/sf";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import type { TriggerSettleInput, TriggerSettleOutput } from "./dto/draw.dto";

const SETTLE_SFN_ARN = process.env.POWER655_SETTLE_SFN_ARN!;

/**
 * Kết sổ kỳ quay Power 6/55.
 *
 * Flow:
 *   1. Validate draw (tồn tại, có result)
 *   2. Transition status: published → settling (atomic)
 *      - Nếu draw đã ở settling (retry) → skip transition
 *   3. Start Settle Step Function (deterministic name → idempotent)
 *
 * Power 6/55 KHÔNG có Split Cycle — theo luật Vietlott gốc.
 */
export class TriggerSettleUseCase extends NextApiUseCase<TriggerSettleInput, TriggerSettleOutput> {
  private readonly drawRepo = new DrawRepository();
  private readonly entryRepo = new EntryRepository();

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
        stateMachineArn: SETTLE_SFN_ARN,
        name: toExecutionName(input.drawId),
        input: { drawId: input.drawId },
      });
    } catch (err) {
      console.error(err);
      throw new AppException("SFN_START_FAILED", `Không thể khởi chạy settle worker`);
    }

    const [totalEntries, totalLines] = await Promise.all([
      this.entryRepo.countEntriesByDrawId(input.drawId),
      this.entryRepo.countLinesByDrawId(input.drawId),
    ]);

    return {
      drawId: input.drawId,
      status: DrawStatus.Settling,
      totalEntries,
      totalLines,
    };
  }
}

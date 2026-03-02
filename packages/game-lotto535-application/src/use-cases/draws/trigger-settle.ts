import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DrawStatus } from "@megawin/game-core/entities";
import { toExecutionName } from "@megawin/game-core/utils";
import { startExecution } from "@megawin/app-core/aws/sf";
import { isSplitCycleDraw } from "@megawin/game-lotto535/rules";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import type { TriggerSettleInput, TriggerSettleOutput } from "./dto/draw.dto";

const SETTLE_SFN_ARN = process.env.LOTTO535_SETTLE_SFN_ARN!;

/**
 * Kết sổ kỳ quay Lotto 5/35.
 *
 * Flow:
 *   1. Validate draw (tồn tại, có result)
 *   2. Xác định split cycle (Jackpot >= threshold + drawNo === 2)
 *   3. Transition status: published → settling (atomic, kèm splitInfo)
 *      - Nếu draw đã ở settling (retry) → skip transition
 *   4. Start Settle Step Function (deterministic name → idempotent)
 */
export class TriggerSettleUseCase extends NextApiUseCase<
  TriggerSettleInput,
  TriggerSettleOutput
> {
  private readonly drawRepo = new DrawRepository();
  private readonly entryRepo = new EntryRepository();
  private readonly cycleRepo = new JackpotCycleRepository();
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();

  protected async execute(
    input: TriggerSettleInput
  ): Promise<TriggerSettleOutput> {
    const draw = await this.drawRepo.getDrawById(input.drawId);
    if (!draw) {
      throw AppException.notFound(`Kỳ quay ${input.drawId} không tồn tại.`);
    }

    if (!draw.result) {
      throw AppException.badRequest(
        "Chưa có kết quả quay – phải publish result trước khi kết sổ."
      );
    }

    let splitCycle = false;

    if (draw.status !== DrawStatus.Settling) {
      const [globalConfig, activeCycle] = await Promise.all([
        this.getGlobalConfig.run(),
        this.cycleRepo.getActiveCycle(),
      ]);

      const jackpotCurrentAmount =
        activeCycle?.currentAmount ?? globalConfig.jackpot.seedAmount;

      splitCycle = isSplitCycleDraw(
        jackpotCurrentAmount,
        globalConfig.jackpot.splitThreshold,
        false,
        draw.drawNo
      );

      const splitInfo = splitCycle
        ? {
            isSplitCycle: true,
            split: {
              thresholdAmount: globalConfig.jackpot.splitThreshold,
              splitRatios: globalConfig.jackpot.splitRatios,
              splitAmount: jackpotCurrentAmount,
              splitRuleVersion: "v1-2026-02",
              hintText: "Kỳ chia giải Jackpot",
            },
          }
        : undefined;

      const updated = await this.drawRepo.triggerSettle(
        input.drawId,
        splitInfo
      );

      if (!updated) {
        throw new AppException(
          "DRAW_INVALID_TRANSITION",
          `Không thể kết sổ – draw hiện tại không ở trạng thái "published".`
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
      throw new AppException(
        "SFN_START_FAILED",
        `Không thể khởi chạy settle worker`
      );
    }

    const [totalEntries, totalLines] = await Promise.all([
      this.entryRepo.countEntriesByDrawId(input.drawId),
      this.entryRepo.countLinesByDrawId(input.drawId),
    ]);

    return {
      drawId: input.drawId,
      status: DrawStatus.Settling,
      isSplitCycle: splitCycle,
      totalEntries,
      totalLines,
    };
  }
}

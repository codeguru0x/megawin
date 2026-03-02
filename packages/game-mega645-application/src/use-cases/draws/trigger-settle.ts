import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DrawStatus } from "@megawin/game-core/entities";
import { isSplitCycleDraw } from "@megawin/game-mega645/rules";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import type { TriggerSettleInput, TriggerSettleOutput } from "./dto/draw.dto";

/**
 * Nhấn "Kết sổ" -- chuyển trạng thái draw sang "settling".
 *
 * Mega 6/45 chỉ có 1 kỳ/ngày → isSplitCycleDraw không cần drawNo.
 * Điều kiện split: Jackpot >= splitThreshold.
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

    const [globalConfig, activeCycle] = await Promise.all([
      this.getGlobalConfig.run(),
      this.cycleRepo.getActiveCycle(),
    ]);

    const jackpotCurrentAmount =
      activeCycle?.currentAmount ?? globalConfig.jackpot.seedAmount;

    const splitCycle = isSplitCycleDraw(
      jackpotCurrentAmount,
      globalConfig.jackpot.splitThreshold,
      false
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

    const updated = await this.drawRepo.triggerSettle(input.drawId, splitInfo);

    if (!updated) {
      throw new AppException(
        "DRAW_INVALID_TRANSITION",
        `Không thể kết sổ – draw hiện tại không ở trạng thái "published".`
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

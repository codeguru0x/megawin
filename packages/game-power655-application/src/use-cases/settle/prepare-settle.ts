/**
 * Use Case: Prepare Settle (Power 6/55)
 *
 * Load toàn bộ context cần thiết cho settle flow. Pure read — không mutate entries.
 * settle-entries sẽ ghi result + chuyển scheduled → settled trực tiếp.
 *
 * Khác biệt so với Lotto 5/35:
 *   - Load dual jackpot opening amounts (JP1 + JP2)
 *   - Config chứa jp1Ratio, jp2Ratio, jp1OverflowThreshold
 *   - Result chứa bonusNumber thay vì winningSpecial
 *
 * IDEMPOTENT: chỉ đọc draw, config, jackpot cycle, đếm entries.
 *
 * CRASH-SAFE: Nếu step function crash giữa chừng và chạy lại,
 * prepare-settle sẽ:
 *   - Accept draw ở status "settling" (đang settle dở)
 *   - Accumulator bắt đầu từ zero – settle-entries chỉ query "scheduled" nên safe
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import type { SettleContext } from "./types";

export interface PrepareSettleInput {
  /** ID kỳ quay cần chuẩn bị settle. */
  drawId: string;
}

/**
 * Load context cho settle flow Power 6/55.
 * Loads dual jackpot (JP1 + JP2) opening amounts từ active cycle.
 */
export class PrepareSettleUseCase extends InternalUseCase<
  PrepareSettleInput,
  SettleContext
> {
  private readonly drawRepo = new DrawRepository();
  private readonly entryRepo = new EntryRepository();
  private readonly cycleRepo = new JackpotCycleRepository();
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();

  /** @inheritdoc */
  protected async execute(
    input: PrepareSettleInput
  ): Promise<SettleContext> {
    const { drawId } = input;

    const draw = await this.drawRepo.getDrawById(drawId);
    if (!draw) {
      throw new Error(`Draw ${drawId} không tồn tại.`);
    }

    if (draw.status !== DrawStatus.Settling) {
      throw new Error(
        `Draw ${drawId} status = "${draw.status}", expected "settling".`
      );
    }

    if (!draw.result) {
      throw new Error(`Draw ${drawId} chưa có kết quả quay.`);
    }

    const [globalConfig, activeCycle] = await Promise.all([
      this.getGlobalConfig.run(),
      this.cycleRepo.getActiveCycle(),
    ]);

    const jp1OpeningAmount =
      activeCycle?.jackpot1Current ?? globalConfig.jackpot.jackpot1.seedAmount;
    const jp2OpeningAmount =
      activeCycle?.jackpot2Current ?? globalConfig.jackpot.jackpot2.seedAmount;

    const isSplitCycle = draw.jackpot?.isSplitCycle ?? false;

    const prizeAmounts: Record<string, number> = {
      tier1: globalConfig.defaultPrizes.tier1,
      tier2: globalConfig.defaultPrizes.tier2,
      tier3: globalConfig.defaultPrizes.tier3,
    };

    const [totalEntries, totalLines] = await Promise.all([
      this.entryRepo.countEntriesByDrawId(drawId),
      this.entryRepo.countLinesByDrawId(drawId),
    ]);

    return {
      drawId,
      drawDate: draw.drawDate,
      drawNo: draw.drawNo,
      financialDate: (draw as any).financialDate ?? draw.drawDate,
      result: {
        winningMain: [...draw.result.winningMain],
        bonusNumber: draw.result.bonusNumber,
      },
      jp1OpeningAmount,
      jp2OpeningAmount,
      isSplitCycle,
      prizeAmounts,
      config: {
        jp1SeedAmount: globalConfig.jackpot.jackpot1.seedAmount,
        jp2SeedAmount: globalConfig.jackpot.jackpot2.seedAmount,
        jp1Ratio: globalConfig.jackpot.jp1ContributionRatio,
        jp2Ratio: globalConfig.jackpot.jp2ContributionRatio,
        jp1OverflowThreshold: globalConfig.jackpot.jp1OverflowThreshold,
        splitThreshold: globalConfig.jackpot.splitThreshold,
        splitRatios: globalConfig.jackpot.splitRatios,
        companyRate: globalConfig.rates.companyRate,
        defaultCommissionRate: globalConfig.rates.defaultCommissionRate,
      },
      totalEntries,
      totalLines,
    };
  }
}

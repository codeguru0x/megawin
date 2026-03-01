/**
 * Use Case: Prepare Settle (Power 6/55)
 *
 * Load toàn bộ context cần thiết cho settle flow.
 * Chỉ ĐỌC dữ liệu, không ghi – hoàn toàn idempotent.
 *
 * Khác biệt so với Lotto 5/35:
 *   - Load dual jackpot opening amounts (JP1 + JP2)
 *   - Config chứa jp1Ratio, jp2Ratio, jp1OverflowThreshold
 *   - Result chứa bonusNumber thay vì winningSpecial
 *
 * CRASH-SAFE: Nếu step function crash giữa chừng và chạy lại,
 * prepare-settle sẽ:
 *   - Accept draw ở status "settling" (đang settle dở)
 *   - Đếm entries CHƯA settled (status = "drawn") thay vì tổng
 *   - Accumulator bắt đầu từ zero – settle-entries chỉ query "drawn" nên safe
 */

import { StepFunctionUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { GetGlobalConfigUseCase } from "../game-config/get-global-config";
import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";

export interface PrepareSettleInput {
  drawId: string;
}

export interface PrepareSettleResult {
  drawId: string;
  drawDate: string;
  drawNo: number;
  financialDate: string;
  result: { winningMain: number[]; bonusNumber: number };
  jp1OpeningAmount: number;
  jp2OpeningAmount: number;
  isSplitCycle: boolean;
  prizeAmounts: Record<string, number>;
  config: {
    jp1SeedAmount: number;
    jp2SeedAmount: number;
    jp1Ratio: number;
    jp2Ratio: number;
    jp1OverflowThreshold: number;
    splitThreshold: number;
    splitRatios: { tier1: number; tier2: number; tier3: number };
    companyRate: number;
    defaultCommissionRate: number;
  };
  totalEntries: number;
  totalLines: number;
}

/**
 * Load context cho settle flow Power 6/55.
 * Loads dual jackpot (JP1 + JP2) opening amounts từ active cycle.
 */
export class PrepareSettleUseCase extends StepFunctionUseCase<
  PrepareSettleInput,
  PrepareSettleResult
> {
  private readonly drawRepo = new DrawRepository();
  private readonly entryRepo = new EntryRepository();
  private readonly cycleRepo = new JackpotCycleRepository();
  private readonly getGlobalConfig = new GetGlobalConfigUseCase();

  /** @inheritdoc */
  protected async execute(
    input: PrepareSettleInput
  ): Promise<PrepareSettleResult> {
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
        winningMain: draw.result.winningMain as unknown as number[],
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

/**
 * Use Case: Prepare Settle (Lotto 5/35)
 *
 * Load toàn bộ context cần thiết cho settle flow.
 * Chỉ ĐỌC dữ liệu, không ghi – hoàn toàn idempotent.
 *
 * CRASH-SAFE: Nếu step function crash giữa chừng và chạy lại,
 * prepare-settle sẽ:
 *   - Accept draw ở status "settling" (đang settle dở)
 *   - Đếm entries CHƯA settled (status = "drawn") thay vì tổng
 *   - Accumulator bắt đầu từ zero – settle-entries chỉ query "drawn" nên safe
 */

import { StepFunctionUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import { buildPrizeAmountMap } from "@megawin/game-lotto535/rules";
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
  result: { winningMain: number[]; winningSpecial: number };
  jackpotOpeningAmount: number;
  isSplitCycle: boolean;
  prizeAmounts: Record<string, number>;
  config: {
    seedAmount: number;
    splitThreshold: number;
    splitRatios: {
      tier1: number;
      tier2: number;
      tier3: number;
      tier4: number;
      tier5: number;
    };
    companyRate: number;
    defaultCommissionRate: number;
  };
  totalEntries: number;
  totalLines: number;
}

export class PrepareSettleUseCase extends StepFunctionUseCase<
  PrepareSettleInput,
  PrepareSettleResult
> {
  private readonly drawRepo = new DrawRepository();
  private readonly entryRepo = new EntryRepository();
  private readonly cycleRepo = new JackpotCycleRepository();
  private readonly getGlobalConfig = new GetGlobalConfigUseCase();

  /** Load context cho settle flow. Throw nếu draw không hợp lệ. */
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

    const jackpotOpeningAmount =
      activeCycle?.currentAmount ?? globalConfig.jackpot.seedAmount;

    const isSplitCycle = draw.jackpot?.isSplitCycle ?? false;

    const prizeMap = buildPrizeAmountMap(globalConfig.defaultPrizes);
    const prizeAmounts: Record<string, number> = {};
    for (const [tier, amount] of prizeMap) {
      prizeAmounts[tier] = amount;
    }

    const [totalEntries, totalLines] = await Promise.all([
      this.entryRepo.countEntriesByDrawId(drawId),
      this.entryRepo.countLinesByDrawId(drawId),
    ]);

    return {
      drawId,
      drawDate: draw.drawDate,
      drawNo: draw.drawNo,
      financialDate: draw.financialDate,
      result: {
        winningMain: draw.result.winningMain as unknown as number[],
        winningSpecial: draw.result.winningSpecial,
      },
      jackpotOpeningAmount,
      isSplitCycle,
      prizeAmounts,
      config: {
        seedAmount: globalConfig.jackpot.seedAmount,
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

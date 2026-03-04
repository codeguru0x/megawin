/**
 * Use Case: Prepare Settle (Mega 6/45)
 *
 * Load toàn bộ context cần thiết cho settle flow. Pure read — không mutate entries.
 * settle-entries sẽ ghi result + chuyển scheduled → settled trực tiếp.
 *
 * IDEMPOTENT: chỉ đọc draw, config, jackpot cycle, đếm entries.
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import { buildPrizeAmountMap } from "@megawin/game-mega645/rules";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import type { MegaDrawResult, MegaSettleConfig } from "./types";

export interface PrepareSettleInput {
  /** ID kỳ quay cần chuẩn bị settle. */
  drawId: string;
}

export interface PrepareSettleResult {
  /** ID kỳ quay đang settle. */
  drawId: string;
  /** Ngày quay thưởng (ISO date). */
  drawDate: string;
  /** Số thứ tự kỳ quay. */
  drawNo: number;
  /** Ngày tài chính ghi nhận doanh thu/chi phí. */
  financialDate: string;
  /** Kết quả quay thưởng. */
  result: MegaDrawResult;
  /** Giá trị jackpot đầu kỳ (VND), đọc từ active cycle. */
  jackpotOpeningAmount: number;
  /** Kỳ này có thực hiện split jackpot không (jackpot đã đạt ngưỡng). */
  isSplitCycle: boolean;
  /** Bảng tiền thưởng theo hạng: key = tier (e.g. "tier2"), value = VND. Jackpot (tier1) = 0 ở đây. */
  prizeAmounts: Record<string, number>;
  /** Cấu hình tài chính & jackpot snapshot tại thời điểm settle. */
  config: MegaSettleConfig;
  /** Tổng số entry cần settle trong kỳ. */
  totalEntries: number;
  /** Tổng số dòng (lines) cần xử lý — expand từ tất cả entry. */
  totalLines: number;
}

export class PrepareSettleUseCase extends InternalUseCase<
  PrepareSettleInput,
  PrepareSettleResult
> {
  private readonly drawRepo = new DrawRepository();
  private readonly entryRepo = new EntryRepository();
  private readonly cycleRepo = new JackpotCycleRepository();
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();

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

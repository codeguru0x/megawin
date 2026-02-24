/**
 * Use Case: Prepare Settle (Keno)
 *
 * Load context cho settle flow. Chỉ ĐỌC, không ghi – idempotent.
 *
 * Keno khác Lotto 5/35: KHÔNG có Jackpot.
 * Giải thưởng cố định theo bảng prize table.
 */

import { StepFunctionUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { GameConfigRepository } from "../../infras/repos/game-config-repo";

export interface PrepareSettleInput {
  drawId: string;
}

export interface PrepareSettleResult {
  drawId: string;
  drawDate: string;
  drawNo: number;
  financialDate: string;
  result: {
    winningNumbers: number[];
    bigCount: number;
    smallCount: number;
    evenCount: number;
    oddCount: number;
  };
  config: {
    companyRate: number;
    defaultCommissionRate: number;
    basicPrizes: Record<string, Record<number, number>>;
    bigSmallPrizes: Record<string, number>;
    evenOddPrizes: Record<string, number>;
    payoutCaps: {
      pick8MaxPerDraw: number;
      pick8MaxSetsForFixed: number;
      pick9MaxPerDraw: number;
      pick9MaxSetsForFixed: number;
      pick10MaxPerDraw: number;
      pick10MaxSetsForFixed: number;
    };
  };
  totalEntries: number;
}

export class PrepareSettleUseCase extends StepFunctionUseCase<
  PrepareSettleInput,
  PrepareSettleResult
> {
  private readonly drawRepo = new DrawRepository();
  private readonly entryRepo = new EntryRepository();
  private readonly configRepo = new GameConfigRepository();

  /** Load context cho Keno settle flow. Throw nếu draw không hợp lệ. */
  protected async execute(input: PrepareSettleInput): Promise<PrepareSettleResult> {
  const { drawId } = input;
  const draw = await this.drawRepo.getDrawById(drawId);
  if (!draw) {
    throw new Error(`Draw ${drawId} không tồn tại.`);
  }

  if (draw.status !== DrawStatus.Settling) {
    throw new Error(
      `Draw ${drawId} status = "${draw.status}", expected "settling".`,
    );
  }

  if (!draw.result) {
    throw new Error(`Draw ${drawId} chưa có kết quả quay.`);
  }

  const globalConfig = await this.configRepo.getGlobalConfig();
  if (!globalConfig) {
    throw new Error("GameConfig global chưa được khởi tạo.");
  }

  const totalEntries = await this.entryRepo.countEntriesByDrawId(drawId);

  return {
    drawId,
    drawDate: draw.drawDate,
    drawNo: draw.drawNo,
    financialDate: draw.financialDate ?? draw.drawDate,
    result: {
      winningNumbers: draw.result.winningNumbers,
      bigCount: draw.result.bigCount,
      smallCount: draw.result.smallCount,
      evenCount: draw.result.evenCount,
      oddCount: draw.result.oddCount,
    },
    config: {
      companyRate: globalConfig.rates.companyRate,
      defaultCommissionRate: globalConfig.rates.defaultCommissionRate,
      basicPrizes: globalConfig.basicPrizes,
      bigSmallPrizes: globalConfig.bigSmallPrizes as any,
      evenOddPrizes: globalConfig.evenOddPrizes as any,
      payoutCaps: globalConfig.payoutCaps,
    },
    totalEntries,
  };
  }
}

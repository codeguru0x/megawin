/**
 * Use Case: Prepare Settle (Keno)
 *
 * Load context cho settle flow. Pure read — không mutate entries.
 * settle-entries sẽ ghi result + chuyển scheduled → settled trực tiếp.
 *
 * Keno khác Lotto 5/35: KHÔNG có Jackpot.
 * Giải thưởng cố định theo bảng prize table.
 *
 * IDEMPOTENT: chỉ đọc draw, config, đếm entries.
 */

import { AppException, InternalUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import type { BigSmallPrizes, EvenOddPrizes } from "@megawin/game-keno/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";

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
    bigSmallPrizes: BigSmallPrizes;
    evenOddPrizes: EvenOddPrizes;
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

export class PrepareSettleUseCase extends InternalUseCase<PrepareSettleInput, PrepareSettleResult> {
  private readonly drawRepo = new DrawRepository();
  private readonly entryRepo = new EntryRepository();
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();

  /** Load context cho Keno settle flow. Throw nếu draw không hợp lệ. */
  protected async execute(input: PrepareSettleInput): Promise<PrepareSettleResult> {
    const { drawId } = input;

    const draw = await this.drawRepo.getDrawById(drawId);
    if (!draw) {
      throw AppException.notFound(`Draw ${drawId} không tồn tại.`);
    }

    if (draw.status !== DrawStatus.Settling) {
      throw AppException.badRequest(
        `Draw ${drawId} status = "${draw.status}", expected "settling".`,
      );
    }

    if (!draw.result) {
      throw AppException.notFound(`Draw ${drawId} chưa có kết quả quay.`);
    }

    const globalConfig = await this.getGlobalConfig.run();

    const totalEntries = await this.entryRepo.countEntriesByDrawId(drawId);

    return {
      drawId,
      drawDate: draw.drawDate,
      drawNo: draw.drawNo,
      financialDate: draw.financialDate,
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
        bigSmallPrizes: globalConfig.bigSmallPrizes,
        evenOddPrizes: globalConfig.evenOddPrizes,
        payoutCaps: globalConfig.payoutCaps,
      },
      totalEntries,
    };
  }
}

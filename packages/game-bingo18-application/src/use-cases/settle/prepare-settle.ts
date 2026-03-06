/**
 * Use Case: Prepare Settle (Bingo 18)
 *
 * Load context cho settle flow. Pure read — không mutate entries.
 * settle-entries sẽ ghi result + chuyển scheduled → settled trực tiếp.
 *
 * Bingo 18: KHÔNG có Jackpot, KHÔNG có payout caps.
 * Giải thưởng cố định theo bảng prize table.
 *
 * IDEMPOTENT: chỉ đọc draw, config, đếm entries.
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import type { SettleContext } from "./types";

export interface PrepareSettleInput {
  /** ID kỳ quay cần settle. */
  drawId: string;
}

export class PrepareSettleUseCase extends InternalUseCase<
  PrepareSettleInput,
  SettleContext
> {
  private readonly drawRepo = new DrawRepository();
  private readonly entryRepo = new EntryRepository();
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();

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

    const globalConfig = await this.getGlobalConfig.run();

    const totalEntries = await this.entryRepo.countEntriesByDrawId(drawId);

    return {
      drawId,
      drawDate: draw.drawDate,
      drawNo: draw.drawNo,
      financialDate: draw.financialDate,
      result: {
        numbers: draw.result.numbers,
        sum: draw.result.sum,
      },
      config: {
        companyRate: globalConfig.rates.companyRate,
        defaultCommissionRate: globalConfig.rates.defaultCommissionRate,
        singleNumPrizes: globalConfig.singleNumPrizes,
        doubleMatchPrizes: globalConfig.doubleMatchPrizes,
        tripleMatchPrizes: globalConfig.tripleMatchPrizes,
        sumTotalPrizes: globalConfig.sumTotalPrizes,
        bigSmallDrawPrizes: globalConfig.bigSmallDrawPrizes,
      },
      totalEntries,
    };
  }
}

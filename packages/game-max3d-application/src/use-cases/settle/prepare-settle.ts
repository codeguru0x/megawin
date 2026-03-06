/**
 * Use Case: Prepare Settle (Max 3D)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * STEP 1 TRONG SETTLE FLOW
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Load toàn bộ context cần thiết cho settle flow. Pure read — không mutate entries.
 * settle-entries sẽ ghi result + chuyển scheduled → settled trực tiếp.
 *
 * Max 3D không có Jackpot tích lũy → không load jackpot cycle.
 *
 * OUTPUT → truyền cho TẤT CẢ steps sau (qua Step Function $settleCtx):
 *   { drawId, drawDate, drawNo, financialDate, result, prizeConfig, config, totalEntries, totalLines }
 *
 * IDEMPOTENT: chỉ đọc draw, config, đếm entries.
 *
 * CRASH-SAFE: Nếu step function crash giữa chừng và chạy lại,
 * prepare-settle sẽ:
 *   - Accept draw ở status "settling" (đang settle dở)
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import type { SettleContext } from "./types";

export interface PrepareSettleInput {
  /** Mã kỳ quay cần settle — phải ở trạng thái "settling". */
  drawId: string;
}

export class PrepareSettleUseCase extends InternalUseCase<PrepareSettleInput, SettleContext> {
  private readonly drawRepo = new DrawRepository();
  private readonly entryRepo = new EntryRepository();
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();

  /** Load context cho settle flow. Throw nếu draw không hợp lệ. */
  protected async execute(input: PrepareSettleInput): Promise<SettleContext> {
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
        special: draw.result.special as [string, string],
        first: draw.result.first as [string, string, string, string],
        second: draw.result.second as [string, string, string, string, string, string],
        third: draw.result.third as [string, string, string, string, string, string, string, string],
      },
      prizeConfig: {
        basic: { ...globalConfig.defaultPrizes.basic },
        combo: {
          combo3: { ...globalConfig.defaultPrizes.combo.combo3 },
          combo6: { ...globalConfig.defaultPrizes.combo.combo6 },
        },
        plus: { ...globalConfig.defaultPrizes.plus },
      },
      config: {
        companyRate: globalConfig.rates.companyRate,
        defaultCommissionRate: globalConfig.rates.defaultCommissionRate,
      },
      totalEntries,
      totalLines,
    };
  }
}

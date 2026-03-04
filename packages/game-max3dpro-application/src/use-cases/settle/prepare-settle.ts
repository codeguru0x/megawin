/**
 * Use Case: Prepare Settle (Max 3D Pro)
 *
 * Load toàn bộ context cần thiết cho settle flow. Pure read — không mutate entries.
 * settle-entries sẽ ghi result + chuyển scheduled → settled trực tiếp.
 *
 * Max 3D Pro không có Jackpot tích lũy → không load jackpot cycle.
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
import type {
  Max3dProDrawResult,
  Max3dProSettleConfig,
  Max3dProPrizeConfig,
} from "./types";

export interface PrepareSettleInput {
  /** ID kỳ quay cần settle. */
  drawId: string;
}

export interface PrepareSettleResult {
  /** ID kỳ quay. */
  drawId: string;
  /** Ngày quay (YYYY-MM-DD). */
  drawDate: string;
  /** Số thứ tự kỳ quay trong ngày. */
  drawNo: number;
  /** Ngày tài chính (dùng cho báo cáo). */
  financialDate: string;
  /** Kết quả quay: 20 bộ ba số theo 4 giải. */
  result: Max3dProDrawResult;
  /** Cấu hình giải thưởng áp dụng cho kỳ này. */
  prizeConfig: Max3dProPrizeConfig;
  /** Cấu hình tài chính áp dụng. */
  config: Max3dProSettleConfig;
  /** Tổng entries cần settle. */
  totalEntries: number;
  /** Tổng pairs cần settle. */
  totalLines: number;
}

export class PrepareSettleUseCase extends InternalUseCase<
  PrepareSettleInput,
  PrepareSettleResult
> {
  private readonly drawRepo = new DrawRepository();
  private readonly entryRepo = new EntryRepository();
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
        standard: { ...globalConfig.defaultPrizes.standard },
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

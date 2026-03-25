/**
 * Use Case: Prepare Settle (Mega 6/45)
 *
 * Load toàn bộ context cần thiết cho settle flow. Pure read — không mutate entries.
 * settle-entries sẽ ghi result + chuyển scheduled → settled trực tiếp.
 *
 * IDEMPOTENT: chỉ đọc draw, config, jackpot cycle.
 * Step Function retry tại chính step này nếu lỗi — draw vẫn là "settling".
 *
 * Mega 6/45 theo luật Vietlott: không có Split Cycle, không cần isSplitCycle.
 */

import { AppException, InternalUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import type { PrizeAmounts } from "@megawin/game-mega645/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import type { SettleContext } from "./types";

export interface PrepareSettleInput {
  /** ID kỳ quay cần chuẩn bị settle. */
  drawId: string;
}

export class PrepareSettleUseCase extends InternalUseCase<PrepareSettleInput, SettleContext> {
  private readonly drawRepo = new DrawRepository();
  private readonly cycleRepo = new JackpotCycleRepository();
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();

  protected async execute(input: PrepareSettleInput): Promise<SettleContext> {
    const { drawId } = input;

    const draw = await this.drawRepo.getDrawById(drawId);
    if (!draw) {
      throw AppException.notFound(`Draw ${drawId} không tồn tại.`);
    }

    if (draw.status !== DrawStatus.Settling) {
      throw AppException.businessRuleViolation(
        `Draw ${drawId} status = "${draw.status}", expected "settling".`,
      );
    }

    if (!draw.result) {
      throw AppException.businessRuleViolation(`Draw ${drawId} chưa có kết quả quay.`);
    }

    const [globalConfig, activeCycle] = await Promise.all([
      this.getGlobalConfig.run(),
      this.cycleRepo.getActiveCycle(),
    ]);

    if (!globalConfig) {
      throw AppException.businessRuleViolation(`Không tìm thấy cấu hình game.`);
    }

    if (!activeCycle) {
      throw AppException.businessRuleViolation(`Không tìm thấy Jackpot Cycle.`);
    }

    // Snapshot cycle stats tại thời điểm PrepareSettle.
    // FinalizeSettle dùng các giá trị này để updateCycleStats với giá trị tuyệt đối
    // → idempotent khi FinalizeSettle bị retry (không cộng dồn 2 lần từ activeCycle).
    const jackpotOpeningAmount = activeCycle.currentAmount;
    const cycleNo = activeCycle.cycleNo;
    const cycleContributionBefore = activeCycle.totalContribution;
    const cycleDrawCountBefore = activeCycle.drawCount;

    const prizeAmounts: PrizeAmounts = globalConfig.defaultPrizes;

    return {
      drawId,
      drawDate: draw.drawDate,
      drawNo: draw.drawNo,
      financialDate: draw.financialDate,
      result: {
        winningNumbers: draw.result.winningNumbers as unknown as string[],
      },
      jackpotOpeningAmount,
      prizeAmounts,
      config: {
        seedAmount: globalConfig.jackpot.seedAmount,
        companyRate: globalConfig.rates.companyRate,
        cycleNo,
        cycleContributionBefore,
        cycleDrawCountBefore,
      },
    };
  }
}

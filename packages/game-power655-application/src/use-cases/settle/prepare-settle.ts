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

import { AppException, InternalUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import type { PrizeAmounts } from "@megawin/game-power655/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
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

    const jp1CurrentAmount = activeCycle.jackpot1CurrentAmount;
    const jp2CurrentAmount = activeCycle.jackpot2CurrentAmount;

    const fixedPrizeAmounts: PrizeAmounts = {
      tier1: globalConfig.defaultPrizes.tier1,
      tier2: globalConfig.defaultPrizes.tier2,
      tier3: globalConfig.defaultPrizes.tier3,
    };

    return {
      drawId,
      drawDate: draw.drawDate,
      drawNo: draw.drawNo,
      financialDate: draw.financialDate,
      result: {
        winningMain: [...draw.result.winningMain],
        bonusNumber: draw.result.bonusNumber,
      },
      jp1CurrentAmount,
      jp2CurrentAmount,
      fixedPrizeAmounts,
      config: {
        companyRate: globalConfig.rates.companyRate,
        jp1SeedAmount: globalConfig.jackpot.jackpot1.seedAmount,
        jp2SeedAmount: globalConfig.jackpot.jackpot2.seedAmount,
        // Đọc ratios từ cycle.config (snapshot tại thời điểm tạo cycle).
        // Operator có thể thay đổi GlobalConfig sau khi cycle bắt đầu,
        // nhưng cycle đang chạy phải dùng config gốc để đảm bảo tính nhất quán.
        jp1Ratio: activeCycle.config.jp1ContributionRatio,
        jp2Ratio: activeCycle.config.jp2ContributionRatio,
        jp1OverflowThreshold: activeCycle.config.jp1OverflowThreshold,
        cycleNo: activeCycle.cycleNo,
        cycleDrawCountBefore: activeCycle.drawCount,
      },
    };
  }
}

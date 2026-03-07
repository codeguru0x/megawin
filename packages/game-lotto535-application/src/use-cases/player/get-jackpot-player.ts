/**
 * Use Case: Get Jackpot for Player (Lotto 5/35)
 *
 * Trả thông tin jackpot đơn giản cho player — loại bỏ chi tiết vận hành.
 *
 * Dùng trực tiếp từ active JackpotCycleDoc:
 *   - seedAmount, config.splitThreshold → đã snapshot tại thời điểm tạo cycle
 *   - currentAmount, peakAmount, totalContribution, drawCount → cập nhật mỗi kỳ settle
 * Không cần gọi GlobalConfig.
 */

import { ApiGatewayUseCase, AppException } from "@megawin/app-core/use-cases";
import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import type { PlayerGetJackpotOutput } from "./dto/player.dto";

export class GetJackpotPlayerUseCase extends ApiGatewayUseCase<void, PlayerGetJackpotOutput> {
  private readonly cycleRepo = new JackpotCycleRepository();

  protected async execute(): Promise<PlayerGetJackpotOutput> {
    const activeCycle = await this.cycleRepo.getActiveCycle();

    if (!activeCycle) {
      throw AppException.notFound("Không tìm thấy jackpot hiện tại.");
    }

    const {
      cycleNo,
      currentAmount,
      seedAmount,
      peakAmount,
      totalContribution,
      drawCount,
      startDrawId,
    } = activeCycle;
    const splitThreshold = activeCycle.config.splitThreshold;
    const percentage = Math.min(Math.round((currentAmount / splitThreshold) * 10000) / 100, 100);

    return {
      cycleNo,
      currentAmount,
      seedAmount,
      peakAmount,
      totalContribution,
      drawCount,
      startDrawId,
      progress: {
        splitThreshold,
        percentage,
      },
    };
  }
}

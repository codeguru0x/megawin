/**
 * Use Case: Get Jackpot for Player (Power 6/55)
 *
 * Trả thông tin dual jackpot cho player — bao gồm:
 *   - JP1 (6/6) + JP2 (5/6+bonus) current amounts
 *   - Cycle info: cycleNo, drawCount, jackpot2ResetCount
 *   - Overflow threshold (player hiểu cơ chế "JP1 gần ngưỡng 300 tỷ!")
 *
 * Loại bỏ chi tiết vận hành (config snapshot, winners, closedReason...).
 */

import { ApiGatewayUseCase, AppException } from "@megawin/app-core/use-cases";

import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import type { PlayerGetJackpotOutput } from "./dto/player.dto";

/**
 * Lấy thông tin dual jackpot Power 6/55 cho player.
 *
 * JP1 = trùng 6/6, JP2 = trùng 5/6 + bonus.
 * Trả cycle info đơn giản + overflow threshold để UI hiển thị.
 */
export class GetJackpotPlayerUseCase extends ApiGatewayUseCase<void, PlayerGetJackpotOutput> {
  private readonly cycleRepo = new JackpotCycleRepository();

  protected async execute(): Promise<PlayerGetJackpotOutput> {
    const activeCycle = await this.cycleRepo.getActiveCycle();

    if (activeCycle == null) {
      throw AppException.notFound("Không tìm thấy Jackpot hiện tại.");
    }

    return {
      jackpot1CurrentAmount: activeCycle.jackpot1CurrentAmount,
      jackpot2CurrentAmount: activeCycle.jackpot2CurrentAmount,
      jackpot1SeedAmount: activeCycle.jackpot1SeedAmount,
      jackpot2SeedAmount: activeCycle.jackpot2SeedAmount,
      jackpot1OverflowThreshold: activeCycle.config.jp1OverflowThreshold,
      cycleNo: activeCycle.cycleNo,
      drawCount: activeCycle.drawCount,
      jackpot2ResetCount: activeCycle.jackpot2ResetCount,
      startedAt: activeCycle.createdAt.toISOString(),
      startDrawId: activeCycle.startDrawId,
    };
  }
}

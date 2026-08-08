/**
 * Use Case: Get Jackpot for Player (Mega 6/45)
 *
 * Trả thông tin jackpot đơn giản cho player — loại bỏ chi tiết vận hành.
 *
 * Dùng trực tiếp từ active JackpotCycleDoc:
 *   - seedAmount → snapshot tại thời điểm tạo cycle
 *   - currentAmount, peakAmount, totalContribution, drawCount → cập nhật mỗi kỳ settle
 * Không cần gọi GlobalConfig.
 *
 * Mega 6/45 KHÔNG có splitThreshold — bỏ progress block so với Lotto 5/35.
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

    const { cycleNo, currentAmount, seedAmount, peakAmount, totalContribution, drawCount, startDrawId } = activeCycle;

    return {
      cycleNo,
      currentAmount,
      seedAmount,
      peakAmount,
      totalContribution,
      drawCount,
      startDrawId,
    };
  }
}

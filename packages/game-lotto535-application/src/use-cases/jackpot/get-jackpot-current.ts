/**
 * Use Case: Get Jackpot Current
 *
 * Lấy thông tin Jackpot hiện tại:
 * - Active cycle (số kỳ tích lũy, currentAmount, peakAmount)
 * - Cấu hình ngưỡng chia (splitThreshold, splitRatios)
 * - Progress bar (current / threshold)
 */

import { AppException } from "@megawin/app-core/use-cases";
import { NextApiUseCase } from "@megawin/next/server";

import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import type { GetJackpotCurrentOutput } from "./dto/jackpot.dto";

export class GetJackpotCurrentUseCase extends NextApiUseCase<void, GetJackpotCurrentOutput> {
  private readonly cycleRepo = new JackpotCycleRepository();

  protected async execute(): Promise<GetJackpotCurrentOutput> {
    const [activeCycle] = await Promise.all([this.cycleRepo.getActiveCycle()]);

    if (!activeCycle) {
      throw AppException.notFound("Không tìm thấy jackpot hiện tại. Hãy tạo kỳ mới đầu tiên.");
    }

    const currentAmount = activeCycle.currentAmount;
    const threshold = activeCycle.config.splitThreshold;
    const percentage = Math.min((currentAmount / threshold) * 100, 100);

    return {
      cycle: {
        cycleNo: activeCycle.cycleNo,
        status: activeCycle.status,
        seedAmount: activeCycle.seedAmount,
        currentAmount: currentAmount,
        peakAmount: activeCycle.peakAmount,
        totalContribution: activeCycle.totalContribution,
        drawCount: activeCycle.drawCount,
        startDrawId: activeCycle.startDrawId,
        startedAt: activeCycle.startedAt.toISOString(),
        lastSettledDrawId: activeCycle.lastSettledDrawId,
      },
      config: {
        splitThreshold: threshold,
        splitRatios: activeCycle.config.splitRatios,
      },
      progress: {
        current: currentAmount,
        threshold,
        percentage: Math.round(percentage * 100) / 100,
        remaining: Math.max(threshold - currentAmount, 0),
      },
    };
  }
}

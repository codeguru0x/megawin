/**
 * Use Case: Get Jackpot Current (Lotto 5/35)
 *
 * `GetJackpotCurrentUseCase` là điểm truy cập DUY NHẤT cho dữ liệu jackpot hiện tại
 * ở backoffice. Trả raw output (`GetJackpotCurrentOutput`), throw {@link AppException}
 * `NOT_FOUND` khi chưa có active cycle — KHÔNG đóng gói HTTP.
 *
 * Nội dung:
 * - Active cycle (số kỳ tích lũy, currentAmount, peakAmount)
 * - Cấu hình ngưỡng chia (splitThreshold, splitRatios)
 * - Progress bar (current / threshold)
 *
 * Hai caller:
 *   - Route riêng của game → `GET /api/lotto535/jackpot/current`.
 *   - `GetDashboardJackpotsUseCase` (backoffice, cross-game) → `GET /api/dashboard/jackpots`,
 *     gọi song song 3 game bằng `tryLoad`.
 *
 * CRASH-SAFE: chỉ đọc DB — idempotent, chạy lại nhiều lần an toàn.
 */

import { AppException, UseCase } from "@megawin/app-core/use-cases";

import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import type { GetJackpotCurrentOutput } from "./dto/jackpot.dto";

export class GetJackpotCurrentUseCase extends UseCase<void, GetJackpotCurrentOutput> {
  private readonly cycleRepo = new JackpotCycleRepository();

  protected async execute(): Promise<GetJackpotCurrentOutput> {
    const activeCycle = await this.cycleRepo.getActiveCycle();

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

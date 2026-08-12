/**
 * Use Case: Get Jackpot Current (Lotto 5/35)
 *
 * `GetJackpotCurrentInternalUseCase` là điểm truy cập DUY NHẤT cho dữ liệu jackpot hiện tại
 * ở backoffice. Trả raw output (`GetJackpotCurrentOutput`), throw {@link AppException}
 * `NOT_FOUND` khi chưa có active cycle — KHÔNG đóng gói HTTP.
 *
 * Nội dung:
 * - Active cycle (số kỳ tích lũy, currentAmount, peakAmount)
 * - Cấu hình ngưỡng chia (splitThreshold, splitRatios)
 * - Progress bar (current / threshold)
 *
 * Hai caller:
 *   - `GetJackpotCurrentUseCase` (NextApiUseCase, cùng file) → `GET /api/lotto535/jackpot/current`,
 *     chỉ delegate + đóng gói envelope.
 *   - `GetDashboardJackpotsUseCase` (backoffice, cross-game) → `GET /api/dashboard/jackpots`,
 *     gọi song song 3 game bằng `tryLoad`.
 *
 * CRASH-SAFE: chỉ đọc DB — idempotent, chạy lại nhiều lần an toàn.
 */

import { AppException, InternalUseCase } from "@megawin/app-core/use-cases";
import { NextApiUseCase } from "@megawin/next/server";

import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import type { GetJackpotCurrentOutput } from "./dto/jackpot.dto";

export class GetJackpotCurrentInternalUseCase extends InternalUseCase<void, GetJackpotCurrentOutput> {
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

/**
 * Endpoint: `GET /api/lotto535/jackpot/current`.
 *
 * Chỉ đóng gói HTTP envelope — toàn bộ logic nằm ở {@link GetJackpotCurrentInternalUseCase}
 * (dùng chung với endpoint gộp cross-game `GET /api/dashboard/jackpots`). Sửa logic jackpot
 * thì sửa ở internal use-case, KHÔNG sửa ở đây.
 */
export class GetJackpotCurrentUseCase extends NextApiUseCase<void, GetJackpotCurrentOutput> {
  private readonly internal = new GetJackpotCurrentInternalUseCase();

  protected async execute(): Promise<GetJackpotCurrentOutput> {
    return await this.internal.run();
  }
}

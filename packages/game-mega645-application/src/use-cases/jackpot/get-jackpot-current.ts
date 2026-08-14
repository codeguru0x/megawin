/**
 * Use Case: Get Jackpot Current (Mega 6/45)
 *
 * `GetJackpotCurrentUseCase` là điểm truy cập DUY NHẤT cho dữ liệu jackpot hiện tại
 * ở backoffice. Trả raw output (`GetJackpotCurrentOutput`), throw {@link AppException}
 * `NOT_FOUND` khi chưa có active cycle — KHÔNG đóng gói HTTP.
 *
 * Mega 6/45 theo luật Vietlott: Jackpot chỉ roll-over vô hạn, không có trần.
 * Dùng milestone threshold giả định để hiển thị tiến trình có ý nghĩa cho staff.
 *
 * Hai caller:
 *   - Route riêng của game → `GET /api/mega645/jackpot/current`.
 *   - `GetDashboardJackpotsUseCase` (backoffice, cross-game) → `GET /api/dashboard/jackpots`,
 *     gọi song song 3 game bằng `tryLoad`.
 *
 * CRASH-SAFE: chỉ đọc DB — idempotent, chạy lại nhiều lần an toàn.
 */

import { AppException, UseCase } from "@megawin/app-core/use-cases";

import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import type { GetJackpotCurrentOutput } from "./dto/jackpot.dto";

// ─────────────────────────────────────────────
// Helper: Milestone Threshold
// ─────────────────────────────────────────────

/**
 * Tính ngưỡng milestone giả định cho Mega 6/45 jackpot.
 *
 * Mega 6/45 không có trần cứng → dùng ngưỡng giả định để hiển thị tiến trình.
 * Logic bậc thang:
 *   - Ngưỡng đầu tiên = seedAmount × 10
 *   - Mỗi khi đã đạt ngưỡng, ngưỡng tiếp theo tăng thêm ×5 seed
 *   - Ví dụ seed = 12 tỷ: 120 tỷ → 180 tỷ → 240 tỷ → ...
 *
 * @returns `{ milestoneThreshold, currentMultiple, nextMultiple }`
 */
export function calcMilestoneThreshold(
  seedAmount: number,
  currentAmount: number,
): { milestoneThreshold: number; currentMultiple: number; nextMultiple: number } {
  if (seedAmount <= 0) {
    return { milestoneThreshold: currentAmount || 1, currentMultiple: 10, nextMultiple: 15 };
  }

  // Bội số hiện tại của jackpot so với seed (floor).
  const currentMultipleRaw = currentAmount / seedAmount;

  // Ngưỡng đầu = x10, sau đó x15, x20, x25, ... (tăng 5 mỗi lần).
  // Tìm bội số mốc tiếp theo >= currentMultipleRaw, bắt đầu từ 10, bước 5.
  let milestoneMultiple = 10;
  while (milestoneMultiple <= currentMultipleRaw) {
    milestoneMultiple += 5;
  }

  // currentMultiple = bội số mốc trước đó (milestone đã vượt hoặc đang hướng tới).
  const currentMultiple = milestoneMultiple === 10 ? 10 : milestoneMultiple - 5;

  return {
    milestoneThreshold: seedAmount * milestoneMultiple,
    currentMultiple,
    nextMultiple: milestoneMultiple,
  };
}

// ─────────────────────────────────────────────
// Use Case
// ─────────────────────────────────────────────

export class GetJackpotCurrentUseCase extends UseCase<void, GetJackpotCurrentOutput> {
  private readonly cycleRepo = new JackpotCycleRepository();

  protected async execute(): Promise<GetJackpotCurrentOutput> {
    const activeCycle = await this.cycleRepo.getActiveCycle();

    if (!activeCycle) {
      throw AppException.notFound("Không tìm thấy jackpot hiện tại. Hãy tạo kỳ mới đầu tiên.");
    }

    const { seedAmount, currentAmount } = activeCycle;

    // Tính ngưỡng milestone giả định từ seedAmount và currentAmount.
    const { milestoneThreshold, currentMultiple, nextMultiple } = calcMilestoneThreshold(seedAmount, currentAmount);

    const remaining = Math.max(milestoneThreshold - currentAmount, 0);
    const percentage = milestoneThreshold > 0 ? Math.round((currentAmount / milestoneThreshold) * 1000) / 10 : 0;

    return {
      cycle: {
        cycleNo: activeCycle.cycleNo,
        status: activeCycle.status,
        seedAmount,
        currentAmount,
        peakAmount: activeCycle.peakAmount,
        totalContribution: activeCycle.totalContribution,
        drawCount: activeCycle.drawCount,
        startDrawId: activeCycle.startDrawId,
        startedAt: activeCycle.startedAt.toISOString(),
        lastSettledDrawId: activeCycle.lastSettledDrawId,
      },
      progress: {
        current: currentAmount,
        milestoneThreshold,
        remaining,
        percentage,
        currentMultiple,
        nextMultiple,
      },
    };
  }
}

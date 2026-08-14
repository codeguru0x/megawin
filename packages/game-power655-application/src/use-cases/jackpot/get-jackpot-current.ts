/**
 * Use Case: Get Jackpot Current (Power 6/55)
 *
 * `GetJackpotCurrentUseCase` là điểm truy cập DUY NHẤT cho dữ liệu dual jackpot hiện tại
 * ở backoffice. Trả raw output (`GetJackpotCurrentOutput`), throw {@link AppException}
 * `NOT_FOUND` khi chưa có active cycle — KHÔNG đóng gói HTTP.
 *
 * Nội dung:
 * - Active cycle (JP1 + JP2 current amounts)
 * - Cấu hình overflow threshold
 * - Progress bar cho cả JP1 và JP2
 *
 * Power 6/55 KHÔNG có split cycle — theo luật Vietlott gốc.
 *
 * Hai caller:
 *   - Route riêng của game → `GET /api/power655/jackpot/current`.
 *   - `GetDashboardJackpotsUseCase` (backoffice, cross-game) → `GET /api/dashboard/jackpots`,
 *     gọi song song 3 game bằng `tryLoad`.
 *
 * CRASH-SAFE: chỉ đọc DB — idempotent, chạy lại nhiều lần an toàn.
 */

import { AppException, UseCase } from "@megawin/app-core/use-cases";

import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import { GetGlobalConfigUseCase } from "../game-config/get-global-config";
import type { GetJackpotCurrentOutput } from "./dto/jackpot.dto";

export class GetJackpotCurrentUseCase extends UseCase<void, GetJackpotCurrentOutput> {
  private readonly cycleRepo = new JackpotCycleRepository();
  private readonly getGlobalConfig = new GetGlobalConfigUseCase();

  protected async execute(): Promise<GetJackpotCurrentOutput> {
    const [activeCycle, globalConfig] = await Promise.all([
      this.cycleRepo.getActiveCycle(),
      this.getGlobalConfig.run(),
    ]);

    if (!activeCycle) {
      throw AppException.notFound("Không tìm thấy jackpot hiện tại. Hãy tạo kỳ mới đầu tiên.");
    }

    const config = globalConfig.jackpot;

    return {
      cycle: {
        cycleNo: activeCycle.cycleNo,
        status: activeCycle.status,
        jackpot1CurrentAmount: activeCycle.jackpot1CurrentAmount,
        jackpot2CurrentAmount: activeCycle.jackpot2CurrentAmount,
        jackpot1SeedAmount: activeCycle.jackpot1SeedAmount,
        jackpot2SeedAmount: activeCycle.jackpot2SeedAmount,
        drawCount: activeCycle.drawCount,
        startDrawId: activeCycle.startDrawId,
        startedAt: activeCycle.createdAt.toISOString(),
        jackpot2ResetCount: activeCycle.jackpot2ResetCount,
      },
      config: {
        jp1OverflowThreshold: config.jp1OverflowThreshold,
      },
      // `seed` lấy từ global config (ngưỡng cấu hình hiện hành), KHÔNG phải seed snapshot
      // của cycle — staff cần so sánh mức hiện tại với cấu hình đang áp dụng.
      jackpot1Progress: {
        current: activeCycle.jackpot1CurrentAmount,
        seed: config.jackpot1.seedAmount,
      },
      jackpot2Progress: {
        current: activeCycle.jackpot2CurrentAmount,
        seed: config.jackpot2.seedAmount,
      },
    };
  }
}

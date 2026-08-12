/**
 * Use Case: Get Jackpot Current (Power 6/55)
 *
 * `GetJackpotCurrentInternalUseCase` là điểm truy cập DUY NHẤT cho dữ liệu dual jackpot hiện tại
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
 *   - `GetJackpotCurrentUseCase` (NextApiUseCase, cùng file) → `GET /api/power655/jackpot/current`,
 *     chỉ delegate + đóng gói envelope.
 *   - `GetDashboardJackpotsUseCase` (backoffice, cross-game) → `GET /api/dashboard/jackpots`,
 *     gọi song song 3 game bằng `tryLoad`.
 *
 * CRASH-SAFE: chỉ đọc DB — idempotent, chạy lại nhiều lần an toàn.
 */

import { AppException, InternalUseCase } from "@megawin/app-core/use-cases";
import { NextApiUseCase } from "@megawin/next/server";

import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import type { GetJackpotCurrentOutput } from "./dto/jackpot.dto";

export class GetJackpotCurrentInternalUseCase extends InternalUseCase<void, GetJackpotCurrentOutput> {
  private readonly cycleRepo = new JackpotCycleRepository();
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();

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

/**
 * Endpoint: `GET /api/power655/jackpot/current`.
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

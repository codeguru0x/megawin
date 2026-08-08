/**
 * Use Case: Get Jackpot Current (Power 6/55)
 *
 * Lấy thông tin dual Jackpot hiện tại:
 * - Active cycle (JP1 + JP2 current amounts)
 * - Cấu hình overflow threshold
 * - Progress bar cho cả JP1 và JP2
 * - Kỳ tiếp theo
 *
 * Power 6/55 KHÔNG có split cycle — theo luật Vietlott gốc.
 */

import { JackpotCycleStatus } from "@megawin/game-power655/entities";
import { NextApiUseCase } from "@megawin/next/server";

import { DrawRepository } from "../../infras/repos/draw-repo";
import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import type { GetJackpotCurrentOutput } from "./dto/jackpot.dto";

/**
 * Lấy trạng thái dual jackpot hiện tại Power 6/55.
 * Trả về JP1 (6/6), JP2 (5/6+bonus), và kỳ quay tiếp theo.
 */
export class GetJackpotCurrentUseCase extends NextApiUseCase<void, GetJackpotCurrentOutput> {
  private readonly cycleRepo = new JackpotCycleRepository();
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();

  /** @inheritdoc */
  protected async execute(): Promise<GetJackpotCurrentOutput> {
    const [activeCycle, globalConfig] = await Promise.all([
      this.cycleRepo.getActiveCycle(),
      this.getGlobalConfig.run(),
    ]);

    const config = globalConfig.jackpot;
    const jp1Current = activeCycle?.jackpot1CurrentAmount ?? config.jackpot1.seedAmount;
    const jp2Current = activeCycle?.jackpot2CurrentAmount ?? config.jackpot2.seedAmount;

    return {
      cycle: activeCycle
        ? {
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
          }
        : {
            cycleNo: 0,
            status: JackpotCycleStatus.Active,
            jackpot1CurrentAmount: config.jackpot1.seedAmount,
            jackpot2CurrentAmount: config.jackpot2.seedAmount,
            jackpot1SeedAmount: config.jackpot1.seedAmount,
            jackpot2SeedAmount: config.jackpot2.seedAmount,
            drawCount: 0,
            startDrawId: "",
            startedAt: new Date().toISOString(),
            jackpot2ResetCount: 0,
          },
      config: {
        jp1OverflowThreshold: config.jp1OverflowThreshold,
      },
      jackpot1Progress: {
        current: jp1Current,
        seed: config.jackpot1.seedAmount,
      },
      jackpot2Progress: {
        current: jp2Current,
        seed: config.jackpot2.seedAmount,
      },
    };
  }
}

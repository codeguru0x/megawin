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

import { NextApiUseCase } from "@megawin/next/server";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import type { GetJackpotCurrentOutput } from "./dto/jackpot.dto";

/**
 * Lấy trạng thái dual jackpot hiện tại Power 6/55.
 * Trả về JP1 (6/6), JP2 (5/6+bonus), và kỳ quay tiếp theo.
 */
export class GetJackpotCurrentUseCase extends NextApiUseCase<void, GetJackpotCurrentOutput> {
  private readonly cycleRepo = new JackpotCycleRepository();
  private readonly drawRepo = new DrawRepository();
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();

  /** @inheritdoc */
  protected async execute(): Promise<GetJackpotCurrentOutput> {
    const [activeCycle, globalConfig] = await Promise.all([
      this.cycleRepo.getActiveCycle(),
      this.getGlobalConfig.run(),
    ]);

    const config = globalConfig.jackpot;
    const jp1Current = activeCycle?.jackpot1Current ?? config.jackpot1.seedAmount;
    const jp2Current = activeCycle?.jackpot2Current ?? config.jackpot2.seedAmount;

    const nextScheduled = await this.drawRepo.getNextScheduledDraw();

    return {
      cycle: activeCycle
        ? {
            cycleNo: activeCycle.cycleNo,
            status: activeCycle.status,
            jackpot1Current: activeCycle.jackpot1Current,
            jackpot2Current: activeCycle.jackpot2Current,
            jackpot1Opening: activeCycle.jackpot1Opening,
            jackpot2Opening: activeCycle.jackpot2Opening,
            drawCount: activeCycle.drawCount,
            startDrawId: activeCycle.startDrawId,
            startedAt: activeCycle.createdAt.toISOString(),
          }
        : {
            cycleNo: 0,
            status: "active",
            jackpot1Current: config.jackpot1.seedAmount,
            jackpot2Current: config.jackpot2.seedAmount,
            jackpot1Opening: config.jackpot1.seedAmount,
            jackpot2Opening: config.jackpot2.seedAmount,
            drawCount: 0,
            startDrawId: "",
            startedAt: new Date().toISOString(),
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
      nextDraw: nextScheduled
        ? {
            drawId: nextScheduled.drawId,
            drawNo: nextScheduled.drawNo,
            drawTime: nextScheduled.drawTime.toISOString(),
          }
        : undefined,
    };
  }
}

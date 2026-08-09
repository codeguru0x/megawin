/**
 * Use Case: List All Jackpot Cycle Options
 *
 * Lấy danh sách tất cả vòng Jackpot (active + closed) cho selector dropdown.
 * Giới hạn 10 vòng mới nhất để không làm nặng UI.
 *
 * Mega 6/45 không có split cycle — closeReason chỉ là "winner" | "manual_reset".
 */

import { NextApiUseCase } from "@megawin/next/server";

import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import type { JackpotCycleOption, ListAllJackpotCycleOptionsOutput } from "./dto/jackpot.dto";

export class ListAllJackpotCycleOptionsUseCase extends NextApiUseCase<
  Record<string, never>,
  ListAllJackpotCycleOptionsOutput
> {
  private readonly cycleRepo = new JackpotCycleRepository();

  protected async execute(): Promise<ListAllJackpotCycleOptionsOutput> {
    // Lấy 10 cycles mới nhất (active + closed), sorted by cycleNo desc.
    const cycles = await this.cycleRepo.listAllCycles(10);

    const options: JackpotCycleOption[] = cycles.map((c) => ({
      cycleNo: c.cycleNo,
      status: c.status,
      closeReason: c.closeReason,
      currentAmount: c.currentAmount,
      drawCount: c.drawCount,
      startedAt: c.startedAt.toISOString(),
      closedAt: c.closedAt?.toISOString(),
    }));

    return { cycles: options };
  }
}

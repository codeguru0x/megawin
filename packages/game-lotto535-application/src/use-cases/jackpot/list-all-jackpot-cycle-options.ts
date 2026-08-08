/**
 * Use Case: List All Jackpot Cycle Options
 *
 * Lấy toàn bộ danh sách vòng Jackpot (active + closed) để hiển thị
 * trong cycle selector dropdown trên trang "Lịch sử Jackpot".
 *
 * Số lượng cycles nhỏ (thường < 100), không cần phân trang.
 * Active cycle luôn đứng đầu (cycleNo cao nhất).
 */

import { NextApiUseCase } from "@megawin/next/server";
import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import type { ListAllJackpotCycleOptionsOutput, JackpotCycleOption } from "./dto/jackpot.dto";

export class ListAllJackpotCycleOptionsUseCase extends NextApiUseCase<
  Record<string, never>,
  ListAllJackpotCycleOptionsOutput
> {
  private readonly cycleRepo = new JackpotCycleRepository();

  protected async execute(): Promise<ListAllJackpotCycleOptionsOutput> {
    const cycles = await this.cycleRepo.listAllCycles();

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

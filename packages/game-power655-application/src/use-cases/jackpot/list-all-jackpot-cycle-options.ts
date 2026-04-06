/**
 * Use Case: List All Jackpot Cycle Options (Power 6/55)
 *
 * Lấy danh sách tối đa 10 jackpot cycles gần nhất (active + closed)
 * để populate selector trên UI "Lịch sử Jackpot".
 *
 * Response bao gồm `activeCycleNo` để UI pre-select vòng hiện tại.
 */

import { NextApiUseCase } from "@megawin/next/server";
import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import type { ListAllJackpotCycleOptionsOutput, JackpotCycleOption } from "./dto/jackpot.dto";

/** Lấy danh sách cycle options cho selector "Lịch sử Jackpot" (tối đa 10 vòng). */
export class ListAllJackpotCycleOptionsUseCase extends NextApiUseCase<
  void,
  ListAllJackpotCycleOptionsOutput
> {
  private readonly cycleRepo = new JackpotCycleRepository();

  /** @inheritdoc */
  protected async execute(): Promise<ListAllJackpotCycleOptionsOutput> {
    // closedLimit = 9 để tổng (1 active + 9 closed) = tối đa 10 vòng.
    const cycles = await this.cycleRepo.listAllCycles(9);

    const options: JackpotCycleOption[] = cycles.map((c) => ({
      cycleNo: c.cycleNo,
      status: c.status,
      startDrawId: c.startDrawId,
      closedReason: c.closedReason,
    }));

    // active cycle là phần tử đầu tiên nếu tồn tại (listAllCycles đặt active trước).
    const firstOption = options[0];
    const activeCycleNo =
      firstOption != null && firstOption.status === "active" ? firstOption.cycleNo : null;

    return { cycles: options, activeCycleNo };
  }
}

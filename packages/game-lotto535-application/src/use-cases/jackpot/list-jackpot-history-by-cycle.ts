/**
 * Use Case: List Jackpot History By Cycle
 *
 * Lấy lịch sử biến động Jackpot qua từng kỳ quay đã settled
 * trong 1 vòng Jackpot (cycle) cụ thể.
 *
 * Dùng cho bảng "Lịch sử Jackpot" phía backoffice khi user chọn 1 vòng cụ thể.
 * cycleNo = null → lấy draws thuộc cycle đang active.
 */

import { NextApiUseCase } from "@megawin/next/server";
import { PrizeTier } from "@megawin/game-lotto535/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import type {
  ListJackpotHistoryByCycleInput,
  ListJackpotHistoryByCycleOutput,
  JackpotHistoryItem,
} from "./dto/jackpot.dto";

export class ListJackpotHistoryByCycleUseCase extends NextApiUseCase<
  ListJackpotHistoryByCycleInput,
  ListJackpotHistoryByCycleOutput
> {
  private readonly drawRepo = new DrawRepository();
  private readonly cycleRepo = new JackpotCycleRepository();

  protected async execute(input: ListJackpotHistoryByCycleInput): Promise<ListJackpotHistoryByCycleOutput> {
    const page = input.page ?? 1;
    const size = input.size ?? 20;

    // Xác định startDrawId + endDrawId từ cycle được chọn.
    // cycleNo = null → dùng cycle đang active.
    let startDrawId: string;
    let endDrawId: string | null;

    if (input.cycleNo === null) {
      // Vòng hiện tại (active cycle)
      const activeCycle = await this.cycleRepo.getActiveCycle();
      if (!activeCycle) {
        return { draws: [], page, size, total: 0 };
      }
      startDrawId = activeCycle.startDrawId;
      endDrawId = null;
    } else {
      // Vòng đã đóng — lấy theo cycleNo
      const cycle = await this.cycleRepo.getCycleByNo(input.cycleNo);
      if (!cycle) {
        return { draws: [], page, size, total: 0 };
      }
      startDrawId = cycle.startDrawId;
      endDrawId = cycle.endDrawId ?? null;
    }

    const { draws: rawDraws, total } = await this.drawRepo.getSettledDrawsInCycle(startDrawId, endDrawId, page, size);

    const items: JackpotHistoryItem[] = rawDraws.map((d) => {
      const jpTier = d.settleSummary?.tiers?.find((t) => t.tier === PrizeTier.Jackpot);

      return {
        drawId: d.drawId,
        drawDate: d.drawDate,
        drawNo: d.drawNo,
        drawTime: d.drawTime.toISOString(),
        openingAmount: d.jackpot?.openingAmount ?? 0,
        contribution: d.financial?.jackpotContribution ?? 0,
        closingAmount: d.jackpot?.closingAmount ?? d.jackpot?.openingAmount ?? 0,
        hasWinner: (jpTier?.winnerCount ?? 0) > 0,
        isSplitCycle: d.jackpot?.isSplitCycle ?? false,
        ticketEntryCount: d.stats?.ticketEntryCount ?? 0,
        totalRevenue: d.financial?.totalRevenue ?? 0,
        totalFixedPrizes: d.financial?.totalFixedPrizes ?? 0,
        actualCompanyTake: d.financial?.actualCompanyTake ?? 0,
        companyTakeRate: d.financial?.companyTakeRate ?? 0,
      };
    });

    return { draws: items, page, size, total };
  }
}

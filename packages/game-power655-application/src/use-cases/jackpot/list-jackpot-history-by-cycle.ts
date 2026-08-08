/**
 * Use Case: List Jackpot History By Cycle (Power 6/55)
 *
 * Lấy danh sách draws đã settled trong 1 jackpot cycle cụ thể.
 * Mỗi item bao gồm dual jackpot (JP1 + JP2) opening/closing/contribution,
 * jp1Overflow, financial summary và winner flags.
 *
 * Dùng cho bảng "Lịch sử Jackpot" khi user chọn 1 vòng cụ thể từ selector.
 */

import { NextApiUseCase } from "@megawin/next/server";

import { DrawRepository } from "../../infras/repos/draw-repo";
import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import type {
  JackpotHistoryItem,
  ListJackpotHistoryByCycleInput,
  ListJackpotHistoryByCycleOutput,
} from "./dto/jackpot.dto";

/**
 * Lấy lịch sử kỳ quay theo jackpot cycle đã chọn.
 * Hỗ trợ phân trang, mới nhất trên cùng.
 */
export class ListJackpotHistoryByCycleUseCase extends NextApiUseCase<
  ListJackpotHistoryByCycleInput,
  ListJackpotHistoryByCycleOutput
> {
  private readonly drawRepo = new DrawRepository();
  private readonly cycleRepo = new JackpotCycleRepository();

  /** @inheritdoc */
  protected async execute(input: ListJackpotHistoryByCycleInput): Promise<ListJackpotHistoryByCycleOutput> {
    const page = input.page ?? 1;
    const size = input.size ?? 20;

    // Tìm cycle để lấy startDrawId / endDrawId làm boundary filter.
    const cycle = await this.cycleRepo.getCycleByNo(input.cycleNo);
    if (!cycle) return { draws: [], page, size, total: 0 };

    const { draws: rawDraws, total } = await this.drawRepo.getSettledDrawsInCycle(
      cycle.startDrawId,
      cycle.endDrawId,
      page,
      size,
    );

    const items: JackpotHistoryItem[] = rawDraws.map((d) => {
      const jp1Opening = d.jackpot?.openingJackpot1 ?? 0;
      const jp1Closing = d.jackpot?.closingJackpot1 ?? 0;
      const jp1Contrib = d.financial?.jackpot1Contribution ?? 0;
      const jp2Opening = d.jackpot?.openingJackpot2 ?? 0;
      const jp2Closing = d.jackpot?.closingJackpot2 ?? 0;
      const jp2Contrib = d.financial?.jackpot2Contribution ?? 0;

      // hasJackpot1Winner: closing JP1 thấp hơn expected (opening + contribution)
      // → cycle reset, winner đã nhận pool.
      const hasJackpot1Winner = d.jackpot != null && d.financial != null && jp1Closing < jp1Opening + jp1Contrib;

      // hasJackpot2Winner: closing JP2 thấp hơn expected → JP2 winner đã nhận pool.
      const hasJackpot2Winner = d.jackpot != null && d.financial != null && jp2Closing < jp2Opening + jp2Contrib;

      return {
        drawId: d.drawId,
        drawDate: d.drawDate,
        drawNo: d.drawNo,
        drawTime: typeof d.drawTime === "string" ? d.drawTime : d.drawTime.toISOString(),
        openingJackpot1: jp1Opening,
        openingJackpot2: jp2Opening,
        closingJackpot1: jp1Closing,
        closingJackpot2: jp2Closing,
        jackpot1Contribution: jp1Contrib,
        jackpot2Contribution: jp2Contrib,
        jp1Overflow: d.financial?.jp1Overflow ?? 0,
        hasJackpot1Winner,
        hasJackpot2Winner,
        totalEntries: d.stats?.ticketEntryCount ?? 0,
        totalRevenue: d.financial?.totalRevenue ?? 0,
        totalFixedPrizes: d.financial?.totalFixedPrizes ?? 0,
        actualCompanyTake: d.financial?.actualCompanyTake ?? 0,
        companyTakeRate: d.financial?.companyTakeRate ?? 0,
      };
    });

    return { draws: items, page, size, total };
  }
}

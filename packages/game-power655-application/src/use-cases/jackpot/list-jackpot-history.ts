/**
 * Use Case: List Jackpot History (Power 6/55, draw-by-draw)
 *
 * Lấy lịch sử biến động dual Jackpot qua từng kỳ quay đã settled.
 * Dùng cho bảng "Lịch sử Jackpot" trên backoffice.
 * Hiển thị JP1 + JP2 opening/closing cho mỗi kỳ.
 */

import { NextApiUseCase } from "@megawin/next/server";
import { PrizeTier } from "@megawin/game-power655/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type {
  ListJackpotHistoryInput,
  ListJackpotHistoryOutput,
  JackpotHistoryItem,
} from "./dto/jackpot.dto";

/**
 * Lấy lịch sử biến động dual jackpot qua từng kỳ quay settled.
 * Mỗi item chứa opening/closing JP1 + JP2.
 */
export class ListJackpotHistoryUseCase extends NextApiUseCase<
  ListJackpotHistoryInput,
  ListJackpotHistoryOutput
> {
  private readonly drawRepo = new DrawRepository();

  /** @inheritdoc */
  protected async execute(
    input: ListJackpotHistoryInput
  ): Promise<ListJackpotHistoryOutput> {
    const page = input.page ?? 1;
    const size = input.size ?? 20;

    const draws = await this.drawRepo.getSettledDrawsWithJackpot(page, size);

    const items: JackpotHistoryItem[] = draws.map((d) => ({
      drawId: d.drawId,
      drawDate: d.drawDate,
      drawNo: d.drawNo,
      drawTime: d.drawTime.toISOString(),
      openingJackpot1: d.jackpot?.openingJackpot1 ?? 0,
      openingJackpot2: d.jackpot?.openingJackpot2 ?? 0,
      closingJackpot1: d.jackpot?.closingJackpot1 ?? 0,
      closingJackpot2: d.jackpot?.closingJackpot2 ?? 0,
      jackpot1Contribution: d.financial?.jackpot1Contribution ?? 0,
      jackpot2Contribution: d.financial?.jackpot2Contribution ?? 0,
      hasJackpot1Winner:
        (d.jackpot?.closingJackpot1 ?? 0) < (d.jackpot?.openingJackpot1 ?? 0),
      hasJackpot2Winner:
        (d.jackpot?.closingJackpot2 ?? 0) < (d.jackpot?.openingJackpot2 ?? 0),
      isSplitCycle: d.jackpot?.isSplitCycle ?? false,
      totalEntries: d.stats?.totalEntries ?? 0,
      totalRevenue: d.financial?.totalRevenue ?? 0,
    }));

    return { draws: items, page, size };
  }
}

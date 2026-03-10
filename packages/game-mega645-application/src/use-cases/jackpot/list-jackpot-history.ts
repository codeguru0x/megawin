import { NextApiUseCase } from "@megawin/next/server";
import { PrizeTier } from "@megawin/game-mega645/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type {
  ListJackpotHistoryInput,
  ListJackpotHistoryOutput,
  JackpotHistoryItem,
} from "./dto/jackpot.dto";

export class ListJackpotHistoryUseCase extends NextApiUseCase<
  ListJackpotHistoryInput,
  ListJackpotHistoryOutput
> {
  private readonly drawRepo = new DrawRepository();

  protected async execute(input: ListJackpotHistoryInput): Promise<ListJackpotHistoryOutput> {
    const page = input.page ?? 1;
    const size = input.size ?? 20;

    const draws = await this.drawRepo.getSettledDrawsWithJackpot(page, size);

    const items: JackpotHistoryItem[] = draws.map((d) => {
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
        ticketEntryCount: d.stats?.ticketEntryCount ?? 0,
        totalRevenue: d.stats?.totalSalesAmount ?? 0,
      };
    });

    return { draws: items, page, size };
  }
}

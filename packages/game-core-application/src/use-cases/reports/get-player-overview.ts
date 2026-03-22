import { NextApiUseCase } from "@megawin/next/server";
import { PlayerSettleGameDailyRepository } from "../../infras/repos/player-settle-game-daily-repo";
import type { GetPlayerOverviewInput, GetPlayerOverviewOutput } from "./types";

/**
 * Tổng hợp KPIs + game breakdown của 1 player trong date range.
 *
 * Dùng cho tab "Tổng quan" trang Player Detail (backoffice).
 * Query player_settle_game_daily, group by gameProduct.
 * 1 DB call — aggregate pipeline.
 */
export class GetPlayerOverviewUseCase extends NextApiUseCase<
  GetPlayerOverviewInput,
  GetPlayerOverviewOutput
> {
  private readonly repo = new PlayerSettleGameDailyRepository();

  protected async execute(input: GetPlayerOverviewInput): Promise<GetPlayerOverviewOutput> {
    const data = await this.repo.aggregatePlayerOverview(input.accountId, input.from, input.to);
    return { data };
  }
}

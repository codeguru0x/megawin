import { NextApiUseCase } from "@megawin/next/server";
import { PlayerSettleGameDailyRepository } from "../../infras/repos/player-settle-game-daily-repo";
import type { GetPlayerFinancialsInput, GetPlayerFinancialsOutput } from "./types";

/**
 * Lấy chi tiết ngày × game của 1 player trong date range.
 *
 * Dùng cho tab "Tài chính" trang Player Detail (backoffice).
 * Query player_settle_game_daily, raw docs sort by date desc + game asc.
 * Hỗ trợ filter theo game product (optional).
 * Index: { accountId: 1, financialDate: -1 }
 */
export class GetPlayerFinancialsUseCase extends NextApiUseCase<GetPlayerFinancialsInput, GetPlayerFinancialsOutput> {
  private readonly repo = new PlayerSettleGameDailyRepository();

  protected async execute(input: GetPlayerFinancialsInput): Promise<GetPlayerFinancialsOutput> {
    const data = await this.repo.findPlayerDailyRecords(input.accountId, input.from, input.to, input.game);
    return { data };
  }
}

import { NextApiUseCase } from "@megawin/next/server";
import { GameProduct } from "@megawin/game-core/entities/game-core.enums";
import { PlayerEntryRepository } from "../../infras/repos/player-entry-repo";
import type { GetPlayerDrawBreakdownInput, GetPlayerDrawBreakdownOutput } from "./types";

/**
 * Breakdown theo kỳ quay (drawId) của 1 player trong 1 ngày × 1 game.
 *
 * View 3 trong Player Detail → Tài chính drill-down.
 * Aggregate từ {game}_ticket_entries WHERE { accountId, financialDate, status ∈ [settled, void] }
 * GROUP BY drawId → SUM financial fields.
 */
export class GetPlayerDrawBreakdownUseCase extends NextApiUseCase<
  GetPlayerDrawBreakdownInput,
  GetPlayerDrawBreakdownOutput
> {
  private readonly repo = new PlayerEntryRepository();

  protected async execute(
    input: GetPlayerDrawBreakdownInput,
  ): Promise<GetPlayerDrawBreakdownOutput> {
    const data = await this.repo.aggregatePlayerDrawsInDay(
      input.accountId,
      input.financialDate,
      input.game as GameProduct,
    );
    return { data };
  }
}

import { NextApiUseCase } from "@megawin/next/server";
import { GameProduct } from "@megawin/game-core/entities/game-core.enums";
import { PlayerEntryRepository } from "../../infras/repos/player-entry-repo";
import type { GetPlayerEntriesInput, GetPlayerEntriesOutput } from "./types";

/**
 * Danh sách entries settled/voided của 1 player trong 1 ngày × 1 game.
 *
 * Drill cấp 2 từ bảng tài chính Player Detail.
 * Query {game}_ticket_entries WHERE { accountId, financialDate, status ∈ [settled, void] }.
 * 1 player = 1 tenant duy nhất — không cần tenantId param.
 */
export class GetPlayerEntriesUseCase extends NextApiUseCase<
  GetPlayerEntriesInput,
  GetPlayerEntriesOutput
> {
  private readonly repo = new PlayerEntryRepository();

  protected async execute(input: GetPlayerEntriesInput): Promise<GetPlayerEntriesOutput> {
    const data = await this.repo.getPlayerEntriesByDateAndGame(
      input.accountId,
      input.financialDate,
      input.game as GameProduct,
    );
    return { data };
  }
}

import { NextApiUseCase } from "@megawin/next/server";
import { GameProduct } from "@megawin/game-core/entities/game-core.enums";
import { PlayerEntryRepository } from "../../infras/repos/player-entry-repo";
import type { GetPlayerEntryDetailInput, GetPlayerEntryDetailOutput } from "./types";

/**
 * Lấy full entry doc để hiển thị EntryDetailDialog trong Player Detail.
 *
 * Dùng chung cho 2 luồng:
 * - Tab "Đang chờ": click entry outstanding (scheduled) → dialog không có payout/result
 * - Tab "Tài chính": click entry settled/voided → dialog đầy đủ với payout/result
 *
 * Return raw doc (unknown) vì mỗi game có TicketEntryEntity riêng.
 * Frontend consumer cast sang đúng game-specific type.
 */
export class GetPlayerEntryDetailUseCase extends NextApiUseCase<GetPlayerEntryDetailInput, GetPlayerEntryDetailOutput> {
  private readonly repo = new PlayerEntryRepository();

  protected async execute(input: GetPlayerEntryDetailInput): Promise<GetPlayerEntryDetailOutput> {
    const data = await this.repo.getEntryById(input.game as GameProduct, input.entryId);
    return { data };
  }
}

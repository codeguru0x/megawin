import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { GetTopCombosInput, GetTopCombosOutput } from "./dto/top-combos.dto";

/**
 * Top N bộ số phổ biến nhất trong một kỳ quay Keno.
 *
 * Chỉ thống kê basic boards (pick1-10), side bets không có "combo" concept.
 * Key = sorted numbers + playType để group đúng combo.
 */
export class GetTopCombosUseCase extends NextApiUseCase<GetTopCombosInput, GetTopCombosOutput> {
  private readonly entryRepo = new EntryRepository();
  private readonly drawRepo = new DrawRepository();

  protected async execute(input: GetTopCombosInput): Promise<GetTopCombosOutput> {
    const { drawId } = input;
    const limit = Math.min(input.limit ?? 10, 20);

    const draw = await this.drawRepo.getDrawById(drawId);
    if (!draw) {
      throw AppException.notFound(`Kỳ quay ${drawId} không tồn tại.`);
    }

    const combos = await this.entryRepo.aggregateTopCombos(drawId, limit);

    return {
      drawId,
      combos: combos.map((c, i) => ({
        rank: i + 1,
        playType: c.playType,
        numbers: c.numbers,
        boardCount: c.boardCount,
        entryCount: c.entryCount,
      })),
    };
  }
}

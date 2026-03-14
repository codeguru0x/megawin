import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { GetTopCombosInput, GetTopCombosOutput } from "./dto/top-combos.dto";

/**
 * Top N side bet combinations phổ biến nhất trong một kỳ quay Bingo 18.
 *
 * Bingo 18: side bets có combo concept rõ ràng.
 *   - sumTotal: tổng nào (3-18) được đặt nhiều nhất
 *   - bigSmallDraw: big/draw/small nào phổ biến hơn
 * Khác Keno: không thống kê "bộ số" basic boards (3 xúc xắc 1-6).
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
        playType: c.playType as any,
        sum: c.sum as number | undefined,
        bet: c.bet as any,
        count: c.count,
        entryCount: c.entryCount,
      })),
    };
  }
}

import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { GetTopCombosInput, GetTopCombosOutput, TopComboItem } from "./dto/top-combos.dto";

/**
 * Lấy top N "bộ số phổ biến nhất" trong một kỳ quay Mega 6/45.
 *
 * Nhóm boards theo combo key (playType + sorted mainNumbers),
 * rank theo entryCount (số entries chứa combo) giảm dần.
 *
 * Mega 6/45: không có specialNumbers nên combo key đơn giản hơn Lotto 5/35.
 */
export class GetTopCombosUseCase extends NextApiUseCase<GetTopCombosInput, GetTopCombosOutput> {
  private readonly entryRepo = new EntryRepository();
  private readonly drawRepo = new DrawRepository();

  protected async execute(input: GetTopCombosInput): Promise<GetTopCombosOutput> {
    const draw = await this.drawRepo.getDrawById(input.drawId);
    if (!draw) {
      throw AppException.notFound(`Kỳ quay ${input.drawId} không tồn tại.`);
    }

    const limit = Math.min(input.limit ?? 10, 20);
    const rows = await this.entryRepo.aggregateTopCombos({
      drawId: input.drawId,
      limit,
    });

    const combos: TopComboItem[] = rows.map((r, idx) => ({
      rank: idx + 1,
      playType: r.playType,
      mainNumbers: r.mainNumbers,
      entryCount: r.entryCount,
      totalAmount: r.totalAmount,
    }));

    return { drawId: input.drawId, combos };
  }
}

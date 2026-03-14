import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { GetTopCombosInput, GetTopCombosOutput, TopPairComboItem } from "./dto/top-combos.dto";

/**
 * Lấy top N cặp TripletPair phổ biến nhất trong một kỳ quay Max 3D Pro.
 *
 * Max 3D Pro chỉ có 1 loại combo: cặp ordered pair (first, second).
 * Khác Max 3D (có basic + plus), Max 3D Pro tất cả boards đều tạo cặp TripletPair.
 *
 * Dùng để phát hiện "cặp số hot" — rủi ro tập trung thưởng ĐB/phụ ĐB.
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

    const rows = await this.entryRepo.aggregateTopPairCombos({ drawId: input.drawId, limit });

    const pairCombos: TopPairComboItem[] = rows.map((r, idx) => ({
      rank: idx + 1,
      first: r.first,
      second: r.second,
      boardCount: r.boardCount,
      totalAmount: r.totalAmount,
    }));

    return { drawId: input.drawId, pairCombos };
  }
}

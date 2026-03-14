import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type {
  GetTopCombosInput,
  GetTopCombosOutput,
  TopSingleComboItem,
  TopPlusComboItem,
} from "./dto/top-combos.dto";

/**
 * Lấy top N bộ ba phổ biến nhất trong một kỳ quay Max 3D.
 *
 * Trả về 2 danh sách tách biệt:
 * - singleCombos: top bộ ba đơn phổ biến (basic mode, tất cả playType)
 * - plusCombos: top cặp bộ ba phổ biến nhất (plus mode)
 *
 * Dùng để phát hiện "bộ số hot" — rủi ro tập trung thưởng.
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

    const [singleRows, plusRows] = await Promise.all([
      this.entryRepo.aggregateTopSingleCombos({ drawId: input.drawId, limit }),
      this.entryRepo.aggregateTopPlusCombos({ drawId: input.drawId, limit }),
    ]);

    const singleCombos: TopSingleComboItem[] = singleRows.map((r, idx) => ({
      rank: idx + 1,
      triplet: r.triplet,
      boardCount: r.boardCount,
      totalAmount: r.totalAmount,
    }));

    const plusCombos: TopPlusComboItem[] = plusRows.map((r, idx) => ({
      rank: idx + 1,
      triplet1: r.triplet1,
      triplet2: r.triplet2,
      boardCount: r.boardCount,
      totalAmount: r.totalAmount,
    }));

    return { drawId: input.drawId, singleCombos, plusCombos };
  }
}

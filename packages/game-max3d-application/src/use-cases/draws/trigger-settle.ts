import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DrawStatus } from "@megawin/game-core/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import type { TriggerSettleInput, TriggerSettleOutput } from "./dto/draw.dto";

/**
 * Nhấn "Kết sổ" – chuyển trạng thái draw sang "settling".
 *
 * Flow: published -> settling
 *
 * Max 3D không có Jackpot tích lũy → không cần check split cycle.
 *
 * KHÔNG thực hiện settle – chỉ chuyển trạng thái.
 * Worker sẽ pick up draws có status "settling" và xử lý.
 */
export class TriggerSettleUseCase extends NextApiUseCase<
  TriggerSettleInput,
  TriggerSettleOutput
> {
  private readonly drawRepo = new DrawRepository();
  private readonly entryRepo = new EntryRepository();

  protected async execute(
    input: TriggerSettleInput
  ): Promise<TriggerSettleOutput> {
    const draw = await this.drawRepo.getDrawById(input.drawId);
    if (!draw) {
      throw AppException.notFound(`Kỳ quay ${input.drawId} không tồn tại.`);
    }

    if (!draw.result) {
      throw AppException.badRequest(
        "Chưa có kết quả quay – phải publish result trước khi kết sổ."
      );
    }

    const updated = await this.drawRepo.triggerSettle(input.drawId);

    if (!updated) {
      throw new AppException(
        "DRAW_INVALID_TRANSITION",
        `Không thể kết sổ – draw hiện tại không ở trạng thái "published".`
      );
    }

    const [totalEntries, totalLines] = await Promise.all([
      this.entryRepo.countEntriesByDrawId(input.drawId),
      this.entryRepo.countLinesByDrawId(input.drawId),
    ]);

    return {
      drawId: input.drawId,
      status: DrawStatus.Settling,
      totalEntries,
      totalLines,
    };
  }
}

import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { Lotto535DrawStatus } from "@megawin/game-lotto535/entities";
import { isSplitCycleDraw } from "@megawin/game-lotto535/rules";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { GameConfigRepository } from "../../infras/repos/game-config-repo";
import type { TriggerSettleInput, TriggerSettleOutput } from "./dto/draw.dto";

/**
 * Nhấn "Kết sổ" -- chuyển trạng thái draw sang "settling".
 *
 * Flow: published -> settling
 *
 * Xác định nếu kỳ này là split cycle (chia giải Jackpot):
 * - Jackpot >= splitThreshold
 * - Không ai trúng Jackpot (check after worker settle, nhưng mark intent trước)
 * - drawNo === 2 (kỳ 21h)
 *
 * KHÔNG thực hiện settle -- chỉ chuyển trạng thái.
 * Worker sẽ pick up draws có status "settling" và xử lý.
 */
export class TriggerSettleUseCase extends NextApiUseCase<
  TriggerSettleInput,
  TriggerSettleOutput
> {
  protected async execute(
    input: TriggerSettleInput,
  ): Promise<TriggerSettleOutput> {
    const drawRepo = new DrawRepository();
    const entryRepo = new EntryRepository();
    const configRepo = new GameConfigRepository();

    const draw = await drawRepo.getDrawById(input.drawId);
    if (!draw) {
      throw AppException.notFound(`Kỳ quay ${input.drawId} không tồn tại.`);
    }

    if (!draw.result) {
      throw AppException.badRequest(
        "Chưa có kết quả quay – phải publish result trước khi kết sổ.",
      );
    }

    const globalConfig = await configRepo.getGlobalConfig();
    if (!globalConfig) {
      throw AppException.internal("GameConfig chưa được khởi tạo.");
    }

    const splitCycle = isSplitCycleDraw(
      draw.jackpot.openingAmount,
      globalConfig.jackpot.splitThreshold,
      false, // Chưa biết có ai trúng Jackpot → worker sẽ xác định chính xác
      draw.drawNo,
    );

    const extraSet: Record<string, unknown> = {};
    if (splitCycle) {
      extraSet["jackpot.isSplitCycle"] = true;
      extraSet["jackpot.split"] = {
        thresholdAmount: globalConfig.jackpot.splitThreshold,
        splitRatios: globalConfig.jackpot.splitRatios,
        splitAmount: draw.jackpot.openingAmount,
        splitRuleVersion: "v1-2026-02",
        hintText: "Kỳ chia giải Jackpot",
      };
    }

    const updated = await drawRepo.transitionStatus(
      input.drawId,
      Lotto535DrawStatus.Published,
      Lotto535DrawStatus.Settling,
      extraSet,
    );

    if (!updated) {
      throw new AppException(
        "DRAW_INVALID_TRANSITION",
        `Không thể kết sổ – draw hiện tại không ở trạng thái "published".`,
      );
    }

    const [totalEntries, totalLines] = await Promise.all([
      entryRepo.countEntriesByDrawId(input.drawId),
      entryRepo.countLinesByDrawId(input.drawId),
    ]);

    return {
      drawId: input.drawId,
      status: Lotto535DrawStatus.Settling,
      isSplitCycle: splitCycle,
      totalEntries,
      totalLines,
    };
  }
}

/**
 * Use Case: Prepare Settle (Bingo 18)
 *
 * Load context cho settle flow. Pure read — không mutate entries.
 * settle-entries sẽ ghi result + chuyển scheduled → settled trực tiếp.
 *
 * Bingo 18: KHÔNG có Jackpot, KHÔNG có payout caps.
 * Giải thưởng cố định theo bảng prize table.
 *
 * RESETTLE PATH:
 * - `resettleContext` present → propagate xuống mọi state SFN từ đây để
 *   downstream steps (`EnqueueDispatchPayouts` derive batchKey resettle,
 *   `FinalizeSettle` release `WorkerLock`) áp dụng đúng resettle behavior.
 *
 * IDEMPOTENT: chỉ đọc draw + config.
 */

import { AppException, InternalUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import type { ResettleContext, SettleContext } from "./types";

export interface PrepareSettleInput {
  /** ID kỳ quay cần settle. */
  drawId: string;
  /**
   * Marker resettle path — propagate xuống mọi state SFN từ đây.
   *
   * - Absent → settle lần đầu, mọi step chạy bình thường.
   * - Present → nested call từ Resettle SFN, downstream steps đọc và áp dụng:
   *   `EnqueueDispatchPayouts` derive batchKey resettle từ `drawId +
   *   resettleId`, `FinalizeSettle` release `WorkerLock`.
   */
  resettleContext?: ResettleContext;
}

export class PrepareSettleUseCase extends InternalUseCase<PrepareSettleInput, SettleContext> {
  private readonly drawRepo = new DrawRepository();
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();

  protected async execute(input: PrepareSettleInput): Promise<SettleContext> {
    const { drawId, resettleContext } = input;
    const draw = await this.drawRepo.getDrawById(drawId);
    if (!draw) {
      throw AppException.notFound(`Draw ${drawId} không tồn tại.`);
    }

    // Cả settle lần đầu và resettle đều có draw ở Settling khi tới đây:
    // - Settle lần đầu: TriggerSettleUseCase đã transition Published → Settling.
    // - Resettle: TriggerResettleUseCase đã transition Published → Settling.
    if (draw.status !== DrawStatus.Settling) {
      throw AppException.badRequest(
        `Draw ${drawId} status = "${draw.status}", expected "settling".`,
      );
    }

    if (!draw.result) {
      throw AppException.notFound(`Draw ${drawId} chưa có kết quả quay.`);
    }

    const globalConfig = await this.getGlobalConfig.run();

    return {
      drawId,
      drawDate: draw.drawDate,
      drawNo: draw.drawNo,
      financialDate: draw.financialDate,
      result: {
        numbers: draw.result.numbers,
        sum: draw.result.sum,
      },
      config: {
        singleNumPrizes: globalConfig.singleNumPrizes,
        doubleMatchPrizes: globalConfig.doubleMatchPrizes,
        tripleMatchPrizes: globalConfig.tripleMatchPrizes,
        sumTotalPrizes: globalConfig.sumTotalPrizes,
        bigSmallDrawPrizes: globalConfig.bigSmallDrawPrizes,
      },
      resettleContext,
    };
  }
}

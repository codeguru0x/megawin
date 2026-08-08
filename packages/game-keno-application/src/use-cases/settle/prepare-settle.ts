/**
 * Use Case: Prepare Settle (Keno)
 *
 * Load context cho settle flow. Pure read — không mutate entries.
 * settle-entries sẽ ghi result + chuyển scheduled → settled trực tiếp.
 *
 * Keno khác Lotto 5/35: KHÔNG có Jackpot.
 * Giải thưởng cố định theo bảng prize table.
 *
 * IDEMPOTENT: chỉ đọc draw, config.
 */

import { AppException, InternalUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import type { ResettleContext, SettleContext } from "./types";

export interface PrepareSettleInput {
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

  /** Load context cho Keno settle flow. Throw nếu draw không hợp lệ. */
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
      throw AppException.badRequest(`Draw ${drawId} status = "${draw.status}", expected "settling".`);
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
        winningNumbers: draw.result.winningNumbers,
        bigCount: draw.result.bigCount,
        smallCount: draw.result.smallCount,
        evenCount: draw.result.evenCount,
        oddCount: draw.result.oddCount,
      },
      config: {
        basicPrizes: globalConfig.basicPrizes,
        bigSmallPrizes: globalConfig.bigSmallPrizes,
        evenOddPrizes: globalConfig.evenOddPrizes,
        payoutCaps: globalConfig.payoutCaps,
      },
      resettleContext,
    };
  }
}

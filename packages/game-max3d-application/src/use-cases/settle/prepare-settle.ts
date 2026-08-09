/**
 * Use Case: Prepare Settle (Max 3D)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * STEP 1 TRONG SETTLE FLOW
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Load toàn bộ context cần thiết cho settle flow. Pure read — không mutate entries.
 * settle-entries sẽ ghi result + chuyển scheduled → settled trực tiếp.
 *
 * Max 3D không có Jackpot tích lũy → không load jackpot cycle.
 *
 * OUTPUT → truyền cho TẤT CẢ steps sau (qua Step Function $settleCtx):
 *   { drawId, drawDate, drawNo, financialDate, result, prizeConfig, config, totalEntries, totalLines }
 *
 * IDEMPOTENT: chỉ đọc draw, config, đếm entries.
 *
 * CRASH-SAFE: Nếu step function crash giữa chừng và chạy lại,
 * prepare-settle sẽ:
 *   - Accept draw ở status "settling" (đang settle dở)
 */

import { AppException, InternalUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";

import { DrawRepository } from "../../infras/repos/draw-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import type { ResettleContext, SettleContext } from "./types";

export interface PrepareSettleInput {
  /** Mã kỳ quay cần settle — phải ở trạng thái "settling". */
  drawId: string;
  /**
   * Marker resettle path — propagate xuống mọi state SFN từ đây.
   *
   * - Absent → settle lần đầu, mọi step chạy bình thường.
   * - Present → nested call từ Resettle SFN, downstream steps đọc và áp dụng:
   *   `EnqueueDispatchPayouts` derive batchKey resettle từ `drawId +
   *   resettleId`, `FinalizeSettle` release business lock.
   */
  resettleContext?: ResettleContext;
}

export class PrepareSettleUseCase extends InternalUseCase<PrepareSettleInput, SettleContext> {
  private readonly drawRepo = new DrawRepository();
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();

  /** Load context cho settle flow. Throw nếu draw không hợp lệ. */
  protected async execute(input: PrepareSettleInput): Promise<SettleContext> {
    const { drawId, resettleContext } = input;

    const draw = await this.drawRepo.getDrawById(drawId);

    if (!draw) {
      throw AppException.notFound(`Draw ${drawId} không tồn tại.`);
    }

    if (draw.status !== DrawStatus.Settling) {
      throw AppException.businessRuleViolation(`Draw ${drawId} status = "${draw.status}", expected "settling".`);
    }

    if (!draw.result) {
      throw AppException.businessRuleViolation(`Draw ${drawId} chưa có kết quả quay.`);
    }

    const globalConfig = await this.getGlobalConfig.run();

    return {
      drawId,
      drawDate: draw.drawDate,
      drawNo: draw.drawNo,
      financialDate: draw.financialDate,
      result: draw.result,
      prizeConfig: globalConfig.defaultPrizes,
      resettleContext,
    };
  }
}

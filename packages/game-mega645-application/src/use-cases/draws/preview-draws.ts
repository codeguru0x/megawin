/**
 * Use Case: Preview Draws (Mega 6/45)
 *
 * Xem trước danh sách draw slots sẽ được tạo khi gọi CreateDraws.
 */

import { UseCase } from "@megawin/app-core/use-cases";
import { MEGA645_CREATE_DRAW_BATCH_MAX } from "@megawin/game-mega645/schemas";
import { AppException } from "@megawin/shared/errors";

import { calcMega645DrawSlots } from "../../helpers/calc-draw-slots";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { GetGlobalConfigUseCase } from "../game-config/get-global-config";
import type { PreviewDrawsInput, PreviewDrawsOutput } from "./dto/draw.dto";

export class PreviewDrawsUseCase extends UseCase<PreviewDrawsInput, PreviewDrawsOutput> {
  private readonly drawRepo = new DrawRepository();
  private readonly getGlobalConfig = new GetGlobalConfigUseCase();

  protected async execute(input: PreviewDrawsInput): Promise<PreviewDrawsOutput> {
    const { count } = input;

    const globalConfig = await this.getGlobalConfig.run();

    // Zod route (previewDrawsSchema) đã chặn count qua MEGA645_CREATE_DRAW_BATCH_MAX — check lại
    // ở đây để tham chiếu ĐÚNG 1 hằng số duy nhất, không hardcode số lặp lại (dễ lệch khi đổi limit).
    if (count < 1 || count > MEGA645_CREATE_DRAW_BATCH_MAX) {
      throw AppException.badRequest(`Số kỳ xem trước phải từ 1 đến ${MEGA645_CREATE_DRAW_BATCH_MAX}.`);
    }

    // getUnfinishedDraws() default = TOÀN BỘ status chưa hoàn thành (KHÔNG lookback ngày) — không
    // bỏ sót kỳ Voiding (trước đây bị thiếu trong allowStatuses, có thể gây tạo trùng slot).
    const existingActiveDraws = await this.drawRepo.getUnfinishedDraws();
    const existingDrawIds = new Set(existingActiveDraws.map((d) => d.drawId));

    const slots = calcMega645DrawSlots(new Date(), count, globalConfig.play, existingDrawIds);

    return {
      draws: slots.map((s) => ({
        drawDate: s.drawDate,
        drawNo: s.drawNo,
        drawTime: s.drawTime.toISOString(),
        closeAt: s.closeAt.toISOString(),
        status: s.status,
      })),
    };
  }
}

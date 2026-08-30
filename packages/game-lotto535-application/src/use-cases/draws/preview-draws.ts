/**
 * Use Case: Preview Draws (Lotto 5/35)
 *
 * Xem trước danh sách draw slots sẽ được tạo khi gọi CreateDraws.
 * Dùng cho UI backoffice hiển thị preview trước khi tạo.
 */

import { UseCase } from "@megawin/app-core/use-cases";
import { LOTTO535_CREATE_DRAW_BATCH_MAX } from "@megawin/game-lotto535/schemas";
import { AppException } from "@megawin/shared/errors";

import { calcLotto535DrawSlots } from "../../helpers/calc-draw-slots";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { GetGlobalConfigUseCase } from "../game-config/get-global-config";
import type { PreviewDrawsInput, PreviewDrawsOutput } from "./dto/draw.dto";

export class PreviewDrawsUseCase extends UseCase<PreviewDrawsInput, PreviewDrawsOutput> {
  private readonly drawRepo = new DrawRepository();
  private readonly getGlobalConfig = new GetGlobalConfigUseCase();

  protected async execute(input: PreviewDrawsInput): Promise<PreviewDrawsOutput> {
    const { count } = input;

    const globalConfig = await this.getGlobalConfig.run();

    // Zod route (previewDrawsSchema) đã chặn count qua LOTTO535_CREATE_DRAW_BATCH_MAX — check lại
    // ở đây để tham chiếu ĐÚNG 1 hằng số duy nhất, không hardcode số lặp lại (dễ lệch khi đổi limit).
    if (count < 1 || count > LOTTO535_CREATE_DRAW_BATCH_MAX) {
      throw AppException.badRequest(`Số kỳ xem trước phải từ 1 đến ${LOTTO535_CREATE_DRAW_BATCH_MAX}.`);
    }

    // getUnfinishedDraws() default = TOÀN BỘ status chưa hoàn thành (KHÔNG lookback ngày) — không
    // bỏ sót kỳ kẹt cũ, và bắt cả kỳ đang Voiding (subset cũ ở đây từng thiếu Voiding).
    const existingActiveDraws = await this.drawRepo.getUnfinishedDraws();
    const existingDrawIds = new Set(existingActiveDraws.map((d) => d.drawId));

    const slots = calcLotto535DrawSlots(new Date(), count, globalConfig.play, existingDrawIds);

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

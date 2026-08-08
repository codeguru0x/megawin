/**
 * Use Case: Preview Draws (Lotto 5/35)
 *
 * Xem trước danh sách draw slots sẽ được tạo khi gọi CreateDraws.
 * Dùng cho UI backoffice hiển thị preview trước khi tạo.
 */

import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import { calcLotto535DrawSlots } from "../../helpers/calc-draw-slots";
import type { PreviewDrawsInput, PreviewDrawsOutput } from "./dto/draw.dto";

export class PreviewDrawsUseCase extends NextApiUseCase<PreviewDrawsInput, PreviewDrawsOutput> {
  private readonly drawRepo = new DrawRepository();
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();

  protected async execute(input: PreviewDrawsInput): Promise<PreviewDrawsOutput> {
    const { count } = input;

    const globalConfig = await this.getGlobalConfig.run();

    if (count < 1 || count > 12) {
      throw AppException.badRequest("Số kỳ xem trước phải từ 1 đến 12.");
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

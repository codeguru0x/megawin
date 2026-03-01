/**
 * Use Case: Preview Draws (Power 6/55)
 *
 * Xem trước danh sách draw slots sẽ được tạo khi gọi CreateDraws.
 * Dùng cho UI backoffice hiển thị preview trước khi tạo.
 * Power 6/55 chỉ quay thứ 3, 5, 7, mỗi ngày 1 kỳ lúc 18:00.
 */

import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DrawStatus } from "@megawin/game-core/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { GetGlobalConfigUseCase } from "../game-config/get-global-config";
import { calcPower655DrawSlots } from "../../helpers/calc-draw-slots";
import type { PreviewDrawsInput, PreviewDrawsOutput } from "./dto/draw.dto";

/**
 * Preview draw slots trước khi tạo.
 * Trả danh sách các kỳ sẽ được tạo, bao gồm drawDate, drawTime, closeAt.
 */
export class PreviewDrawsUseCase extends NextApiUseCase<
  PreviewDrawsInput,
  PreviewDrawsOutput
> {
  private readonly drawRepo = new DrawRepository();
  private readonly getGlobalConfig = new GetGlobalConfigUseCase();

  /** @inheritdoc */
  protected async execute(
    input: PreviewDrawsInput
  ): Promise<PreviewDrawsOutput> {
    const { count } = input;

    const globalConfig = await this.getGlobalConfig.run();

    if (count < 1 || count > 12) {
      throw AppException.badRequest("Số kỳ xem trước phải từ 1 đến 12.");
    }

    const existingActiveDraws = await this.drawRepo.getActiveDraws([
      DrawStatus.Scheduled,
      DrawStatus.SalesOpen,
      DrawStatus.SalesClosed,
      DrawStatus.Published,
      DrawStatus.Settling,
    ]);
    const existingDrawIds = new Set(existingActiveDraws.map((d) => d.drawId));

    const slots = calcPower655DrawSlots(
      new Date(),
      count,
      globalConfig.play,
      existingDrawIds
    );

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

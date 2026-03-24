/**
 * Use Case: Create Draws (Max 3D Pro) – Batch
 *
 * Tạo nhiều kỳ quay liên tiếp cho ngày hiện tại và các ngày tiếp theo.
 * Max 3D Pro quay vào T3/T5/T7 lúc 18:00 (theo drawDaysOfWeek config).
 *
 * Flow:
 *   1. Load global config → lấy play rules (drawTimes, drawDaysOfWeek, salesCloseBeforeMinutes)
 *   2. Lấy danh sách draws đã tồn tại → skip draws đã có
 *   3. Tính draw slots khả dụng (calcMax3dproDrawSlots)
 *   4. Tạo từng draw: status Scheduled (chờ staff mở bán)
 *
 * Max 3D Pro không có Jackpot tích lũy → không tạo jackpot cycle.
 */

import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DrawStatus } from "@megawin/game-core/entities";
import { generateDrawId } from "@megawin/game-max3dpro/helpers";
import { getFinancialDate } from "@megawin/shared/utils";
import type { DrawNo } from "@megawin/game-max3dpro/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import { calcMax3dproDrawSlots } from "../../helpers/calc-draw-slots";
import type { CreateDrawsInput, CreateDrawsOutput, CreateDrawsOutputItem } from "./dto/draw.dto";

export class CreateDrawsUseCase extends NextApiUseCase<CreateDrawsInput, CreateDrawsOutput> {
  private readonly drawRepo = new DrawRepository();
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();

  protected async execute(input: CreateDrawsInput): Promise<CreateDrawsOutput> {
    const { count } = input;

    const globalConfig = await this.getGlobalConfig.run();
    const { play } = globalConfig;

    if (count < 1 || count > 12) {
      throw AppException.badRequest("Số kỳ tạo phải từ 1 đến 12.");
    }

    const existingActiveDraws = await this.drawRepo.getActiveDraws([
      DrawStatus.Scheduled,
      DrawStatus.SalesOpen,
      DrawStatus.SalesClosed,
      DrawStatus.Published,
      DrawStatus.Settling,
    ]);
    const existingDrawIds = new Set(existingActiveDraws.map((d) => d.drawId));

    const slots = calcMax3dproDrawSlots(new Date(), count, play, existingDrawIds);
    if (slots.length === 0) {
      throw AppException.badRequest("Không còn slot quay nào khả dụng.");
    }

    const now = new Date();
    const draws: CreateDrawsOutputItem[] = [];

    for (const slot of slots) {
      const drawId = generateDrawId(slot.drawDate, slot.drawNo as any);

      const existing = await this.drawRepo.getDrawById(drawId);
      if (existing) continue;

      const status = DrawStatus.Scheduled;

      await this.drawRepo.createDraw({
        drawId,
        drawDate: slot.drawDate,
        financialDate: getFinancialDate(slot.drawTime),
        drawNo: slot.drawNo as DrawNo,
        drawTime: slot.drawTime,
        status,
        sales: {
          closeAt: slot.closeAt,
        },
        createdAt: now,
        updatedAt: now,
      });

      draws.push({
        drawId,
        drawDate: slot.drawDate,
        drawNo: slot.drawNo,
        drawTime: slot.drawTime.toISOString(),
        closeAt: slot.closeAt.toISOString(),
        financialDate: getFinancialDate(slot.drawTime),
        status,
      });
    }

    return { draws };
  }
}

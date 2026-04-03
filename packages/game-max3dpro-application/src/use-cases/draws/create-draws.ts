/**
 * Use Case: Create Draws (Max 3D Pro) – Batch
 *
 * Tạo nhiều kỳ quay liên tiếp cho ngày hiện tại và các ngày tiếp theo.
 * Max 3D Pro quay vào T3/T5/T7 lúc 18:00 (theo drawDaysOfWeek config).
 *
 * Flow:
 *   1. Nhận `draws[]` từ input — mỗi phần tử chứa drawDate, drawTime, openNow
 *   2. Tính drawNo từ lịch (1 kỳ/ngày) và generate drawId
 *   3. Tạo từng draw: status Scheduled hoặc SalesOpen (theo openNow)
 *
 * Max 3D Pro không có Jackpot tích luỹ → không tạo jackpot cycle.
 */

import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DrawStatus } from "@megawin/game-core/entities";
import { generateDrawId } from "@megawin/game-max3dpro/helpers";
import { getFinancialDate, subtractMinutes } from "@megawin/shared/utils";
import type { DrawNo } from "@megawin/game-max3dpro/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import { calcMax3dproDrawSlots } from "../../helpers/calc-draw-slots";
import type { CreateDrawsInput, CreateDrawsOutput, CreateDrawsOutputItem } from "./dto/draw.dto";

export class CreateDrawsUseCase extends NextApiUseCase<CreateDrawsInput, CreateDrawsOutput> {
  private readonly drawRepo = new DrawRepository();
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();

  protected async execute(input: CreateDrawsInput): Promise<CreateDrawsOutput> {
    const { draws: inputDraws } = input;

    if (inputDraws.length < 1 || inputDraws.length > 12) {
      throw AppException.badRequest("Số kỳ tạo phải từ 1 đến 12.");
    }

    const globalConfig = await this.getGlobalConfig.run();
    const { play } = globalConfig;

    const existingActiveDraws = await this.drawRepo.getActiveDraws([
      DrawStatus.Scheduled,
      DrawStatus.SalesOpen,
      DrawStatus.SalesClosed,
      DrawStatus.Published,
      DrawStatus.Settling,
    ]);
    const existingDrawIds = new Set(existingActiveDraws.map((d) => d.drawId));

    // Tính slots để lấy drawNo tương ứng với từng drawDate
    const slots = calcMax3dproDrawSlots(new Date(), inputDraws.length + 12, play, existingDrawIds);

    const now = new Date();
    const draws: CreateDrawsOutputItem[] = [];

    for (const item of inputDraws) {
      // Tìm slot tương ứng với drawDate từ input
      const matchingSlot = slots.find((s) => s.drawDate === item.drawDate);

      if (!matchingSlot) {
        throw AppException.badRequest(
          `Ngày "${item.drawDate}" không phải ngày quay hợp lệ (T3/T5/T7) hoặc kỳ đã tồn tại.`,
        );
      }

      const drawId = generateDrawId(item.drawDate, matchingSlot.drawNo as any);

      const existingDraw = await this.drawRepo.getDrawById(drawId);
      if (existingDraw) continue;

      const drawTime = new Date(item.drawTime);
      const closeAt = subtractMinutes(drawTime, play.salesCloseBeforeMinutes);
      const status = item.openNow ? DrawStatus.SalesOpen : DrawStatus.Scheduled;

      await this.drawRepo.createDraw({
        drawId,
        drawDate: item.drawDate,
        financialDate: getFinancialDate(drawTime),
        drawNo: matchingSlot.drawNo as DrawNo,
        drawTime,
        status,
        sales: {
          closeAt,
          ...(item.openNow ? { openAt: now } : {}),
        },
        createdAt: now,
        updatedAt: now,
      });

      draws.push({
        drawId,
        drawDate: item.drawDate,
        drawNo: matchingSlot.drawNo,
        drawTime: drawTime.toISOString(),
        closeAt: closeAt.toISOString(),
        financialDate: getFinancialDate(drawTime),
        status,
      });
    }

    return { draws };
  }
}

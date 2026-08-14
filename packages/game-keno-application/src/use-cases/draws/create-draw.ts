/**
 * Use Case: Create Draw (Keno) – Batch
 *
 * Client gửi lên mảng các kỳ cần tạo (drawDate, drawTime, openNow).
 * Server:
 *   1. Validate: 1-30 kỳ, drawDate là hôm nay
 *   2. Tính closeAt = drawTime − play.salesCloseBeforeSeconds
 *   3. Tự gán drawNo từ atomic counter (không trust drawNo từ client)
 *   4. Tạo draw với status SalesOpen (openNow=true) hoặc Scheduled (openNow=false)
 */

import { UseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import { generateKenoDrawId } from "@megawin/game-keno/helpers";
import { AppException } from "@megawin/shared/errors";
import { getFinancialDate, todayVN } from "@megawin/shared/utils";

import { DrawCounterRepository } from "../../infras/repos/draw-counter-repo";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { GetGlobalConfigUseCase } from "../game-config/get-global-config";
import type { CreateDrawInput, CreateDrawOutput, CreateDrawOutputItem } from "./dto/draw.dto";

export class CreateDrawUseCase extends UseCase<CreateDrawInput, CreateDrawOutput> {
  private readonly drawRepo = new DrawRepository();
  private readonly counterRepo = new DrawCounterRepository();
  private readonly getGlobalConfig = new GetGlobalConfigUseCase();

  protected async execute(input: CreateDrawInput): Promise<CreateDrawOutput> {
    const { draws: slots } = input;

    if (slots.length < 1 || slots.length > 30) {
      throw AppException.badRequest("Số kỳ tạo phải từ 1 đến 30.");
    }

    const today = todayVN();
    // Keno chỉ tạo kỳ cho hôm nay — tất cả slot phải có cùng drawDate = today.
    const uniqueDates = new Set(slots.map((s) => s.drawDate));
    if (uniqueDates.size !== 1 || !uniqueDates.has(today)) {
      throw AppException.badRequest(`Chỉ cho phép tạo kỳ quay cho ngày hôm nay (${today}).`);
    }

    const drawDate = today;

    const globalConfig = await this.getGlobalConfig.run();
    const { play } = globalConfig;

    // Gán drawNo từ atomic counter — không dùng drawNo từ client.
    const firstDrawNo = await this.counterRepo.getNextDrawNoBatch(drawDate, slots.length);

    const now = new Date();
    const draws: CreateDrawOutputItem[] = [];

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i]!;
      const drawNo = firstDrawNo + i;
      const drawId = generateKenoDrawId(drawDate, drawNo);
      const drawTimeDate = new Date(slot.drawTime);

      // closeAt tính server-side: drawTime − salesCloseBeforeSeconds (theo config).
      const closeAt = new Date(drawTimeDate.getTime() - play.salesCloseBeforeSeconds * 1000);

      const status = slot.openNow ? DrawStatus.SalesOpen : DrawStatus.Scheduled;

      await this.drawRepo.createDraw({
        drawId,
        drawDate,
        financialDate: getFinancialDate(drawTimeDate),
        drawNo,
        drawTime: drawTimeDate,
        status,
        sales: slot.openNow ? { closeAt, openAt: now } : { closeAt },
        createdAt: now,
        updatedAt: now,
      });

      draws.push({
        drawId,
        drawDate,
        drawNo,
        drawTime: drawTimeDate.toISOString(),
        closeAt: closeAt.toISOString(),
        financialDate: getFinancialDate(drawTimeDate),
        status,
      });
    }

    return { draws };
  }
}

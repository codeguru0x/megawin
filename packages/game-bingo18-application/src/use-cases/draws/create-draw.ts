import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DrawStatus } from "@megawin/game-core/entities";
import { generateBingo18DrawId } from "@megawin/game-bingo18/helpers";
import { getFinancialDate } from "@megawin/shared/utils/financial-date";
import { todayVN } from "@megawin/shared/utils/date";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { DrawCounterRepository } from "../../infras/repos/draw-counter-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import { calcDrawSlotsForDate } from "../../helpers/calc-draw-slots";
import type { CreateDrawInput, CreateDrawOutput, CreateDrawOutputItem } from "./dto/draw.dto";

export class CreateDrawUseCase extends NextApiUseCase<CreateDrawInput, CreateDrawOutput> {
  private readonly drawRepo = new DrawRepository();
  private readonly counterRepo = new DrawCounterRepository();
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();

  protected async execute(input: CreateDrawInput): Promise<CreateDrawOutput> {
    const { drawDate, count, openNow } = input;
    const today = todayVN();

    if (drawDate !== today) {
      throw AppException.badRequest(`Chỉ cho phép tạo kỳ quay cho ngày hôm nay (${today}).`);
    }

    const globalConfig = await this.getGlobalConfig.run();

    const { play } = globalConfig;

    const slots = calcDrawSlotsForDate(new Date(), drawDate, count, play);
    if (slots.length === 0) {
      throw AppException.badRequest(`Không còn slot quay nào khả dụng trong ngày ${drawDate}.`);
    }

    const firstDrawNo = await this.counterRepo.getNextDrawNoBatch(drawDate, slots.length);

    const now = new Date();
    const draws: CreateDrawOutputItem[] = [];

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i]!;
      const drawNo = firstDrawNo + i;
      const drawId = generateBingo18DrawId(drawDate, drawNo);
      const status = openNow ? DrawStatus.SalesOpen : DrawStatus.Scheduled;

      await this.drawRepo.createDraw({
        drawId,
        drawDate,
        financialDate: getFinancialDate(slot.drawTime),
        drawNo,
        drawTime: slot.drawTime,
        status,
        sales: openNow ? { closeAt: slot.closeAt, openAt: now } : { closeAt: slot.closeAt },
        createdAt: now,
        updatedAt: now,
      });

      draws.push({
        drawId,
        drawDate,
        drawNo,
        drawTime: slot.drawTime.toISOString(),
        closeAt: slot.closeAt.toISOString(),
        financialDate: getFinancialDate(slot.drawTime),
        status,
      });
    }

    return { draws };
  }
}

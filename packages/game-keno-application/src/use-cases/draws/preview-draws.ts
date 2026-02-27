import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { todayVN } from "@megawin/shared/utils/date";
import { GameConfigRepository } from "../../infras/repos/game-config-repo";
import { DrawCounterRepository } from "../../infras/repos/draw-counter-repo";
import { calcDrawSlots } from "./calc-draw-slots";
import type { PreviewDrawsInput, PreviewDrawsOutput } from "./dto/draw.dto";

export class PreviewDrawsUseCase extends NextApiUseCase<
  PreviewDrawsInput,
  PreviewDrawsOutput
> {
  private readonly configRepo = new GameConfigRepository();
  private readonly counterRepo = new DrawCounterRepository();

  protected async execute(
    input: PreviewDrawsInput
  ): Promise<PreviewDrawsOutput> {
    const { drawDate, count } = input;
    const today = todayVN();

    if (drawDate !== today) {
      throw AppException.badRequest(
        `Chỉ cho phép tạo kỳ quay cho ngày hôm nay (${today}).`
      );
    }

    const globalConfig = await this.configRepo.getGlobalConfig();
    if (!globalConfig) {
      throw AppException.internal("Keno GameConfig chưa được khởi tạo.");
    }

    const counter = await this.counterRepo.findOne(
      { drawDate },
      { sort: { drawDate: -1 } }
    );
    const currentLastDrawNo = counter?.lastDrawNo ?? 0;

    const slots = calcDrawSlots(new Date(), drawDate, count, globalConfig.play);

    if (slots.length === 0) {
      throw AppException.badRequest(
        `Không còn slot quay nào khả dụng trong ngày (trước 23:59).`
      );
    }

    return {
      draws: slots.map((slot, i) => ({
        drawNo: currentLastDrawNo + i + 1,
        drawTime: slot.drawTime.toISOString(),
        closeAt: slot.closeAt.toISOString(),
        status: slot.status,
      })),
    };
  }
}

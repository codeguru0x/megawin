import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import { DrawCounterRepository } from "../../infras/repos/draw-counter-repo";
import { calcDrawSlots } from "../../helpers/calc-draw-slots";
import type { PreviewDrawsInput, PreviewDrawsOutput } from "./dto/draw.dto";

export class PreviewDrawsUseCase extends NextApiUseCase<PreviewDrawsInput, PreviewDrawsOutput> {
  private readonly counterRepo = new DrawCounterRepository();
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();

  /**
   * Preview danh sách kỳ quay tiếp theo.
   *
   * Mặc định bắt đầu từ thời điểm hiện tại (giờ VN).
   * Nếu hết slot trong ngày (vượt lastDrawTime) → tự động chuyển sang ngày tiếp theo
   * ở firstDrawTime theo cấu hình game config.
   */
  protected async execute(input: PreviewDrawsInput): Promise<PreviewDrawsOutput> {
    const { count } = input;

    const globalConfig = await this.getGlobalConfig.run();
    const slots = calcDrawSlots(new Date(), count, globalConfig.play);

    if (slots.length === 0) {
      throw AppException.badRequest("Không thể tính slot quay nào.");
    }

    // Lấy counter cho từng ngày xuất hiện trong slots để tính drawNo chính xác
    const uniqueDates = [...new Set(slots.map((s) => s.drawDate))];
    const countersMap = new Map<string, number>();

    for (const date of uniqueDates) {
      const counter = await this.counterRepo.findOne({ drawDate: date }, { sort: { drawDate: -1 } });
      countersMap.set(date, counter?.lastDrawNo ?? 0);
    }

    // Đếm drawNo tăng dần theo từng ngày
    const dateDrawNos = new Map<string, number>();
    for (const date of uniqueDates) {
      dateDrawNos.set(date, countersMap.get(date)!);
    }

    return {
      draws: slots.map((slot) => {
        const currentNo = dateDrawNos.get(slot.drawDate)!;
        const nextNo = currentNo + 1;
        dateDrawNos.set(slot.drawDate, nextNo);

        return {
          drawNo: nextNo,
          drawDate: slot.drawDate,
          drawTime: slot.drawTime.toISOString(),
          closeAt: slot.closeAt.toISOString(),
          status: slot.status,
        };
      }),
    };
  }
}

/**
 * Use Case: Create Draws (Lotto 5/35) – Batch
 *
 * Tạo nhiều kỳ quay liên tiếp cho ngày hiện tại và các ngày tiếp theo.
 *
 * Flow:
 *   1. Load global config → lấy play rules (drawTimes, salesCloseBeforeMinutes)
 *   2. Lấy danh sách draws đã tồn tại → calcDrawSlots skip draws đã có
 *   3. Tính draw slots khả dụng (calcLotto535DrawSlots)
 *   4. Tạo từng draw: status salesOpen (auto mở bán)
 *   5. Tạo jackpot cycle nếu chưa có
 *
 * JACKPOT: Không ghi jackpot lên draw khi tạo.
 * Active draws đọc jackpot từ `lotto535_jackpot_cycles.currentAmount`.
 * Jackpot snapshot chỉ ghi lên draw khi settle (finalize-settle).
 */

import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DrawStatus } from "@megawin/game-core/entities";
import { generateDrawId } from "@megawin/game-lotto535/helpers";
import { getFinancialDate } from "@megawin/shared/utils/financial-date";
import type { DrawNo } from "@megawin/game-lotto535/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import { calcLotto535DrawSlots } from "../../helpers/calc-draw-slots";
import type {
  CreateDrawsInput,
  CreateDrawsOutput,
  CreateDrawsOutputItem,
} from "./dto/draw.dto";

export class CreateDrawsUseCase extends NextApiUseCase<
  CreateDrawsInput,
  CreateDrawsOutput
> {
  private readonly drawRepo = new DrawRepository();
  private readonly cycleRepo = new JackpotCycleRepository();
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();

  protected async execute(input: CreateDrawsInput): Promise<CreateDrawsOutput> {
    const { count } = input;

    const globalConfig = await this.getGlobalConfig.run();

    const { play, jackpot: jackpotConfig } = globalConfig;

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

    const slots = calcLotto535DrawSlots(
      new Date(),
      count,
      play,
      existingDrawIds
    );
    if (slots.length === 0) {
      throw AppException.badRequest("Không còn slot quay nào khả dụng.");
    }

    const now = new Date();
    const draws: CreateDrawsOutputItem[] = [];

    for (const slot of slots) {
      const drawId = generateDrawId(slot.drawDate, slot.drawNo as any);

      const existing = await this.drawRepo.getDrawById(drawId);
      if (existing) continue;

      const status = DrawStatus.SalesOpen;

      await this.drawRepo.createDraw({
        drawId,
        drawDate: slot.drawDate,
        financialDate: getFinancialDate(slot.drawTime),
        drawNo: slot.drawNo as DrawNo,
        drawTime: slot.drawTime,
        status,
        sales: {
          closeAt: slot.closeAt,
          openAt: now,
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

    if (draws.length > 0) {
      const activeCycle = await this.cycleRepo.getActiveCycle();
      if (!activeCycle) {
        await this.cycleRepo.createCycle({
          startDrawId: draws[0]!.drawId,
          seedAmount: jackpotConfig.seedAmount,
          config: {
            splitThreshold: jackpotConfig.splitThreshold,
            splitRatios: jackpotConfig.splitRatios,
          },
        });
      }
    }

    return { draws };
  }
}

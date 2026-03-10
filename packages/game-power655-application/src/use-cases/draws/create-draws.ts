/**
 * Use Case: Create Draws (Power 6/55) – Batch
 *
 * Tạo nhiều kỳ quay liên tiếp cho ngày hiện tại và các ngày tiếp theo.
 * Power 6/55 chỉ quay thứ 3, 5, 7, mỗi ngày 1 kỳ lúc 18:00.
 *
 * Flow:
 *   1. Load global config → lấy play rules (drawTimes, drawDaysOfWeek, salesCloseBeforeMinutes)
 *   2. Lấy danh sách draws đã tồn tại → calcPower655DrawSlots skip draws đã có
 *   3. Tính draw slots khả dụng
 *   4. Tạo từng draw: status salesOpen (auto mở bán)
 *   5. Tạo jackpot cycle nếu chưa có (dual: JP1 30 tỷ, JP2 3 tỷ)
 *
 * JACKPOT: Không ghi jackpot lên draw khi tạo.
 * Active draws đọc jackpot từ JackpotCycle.jackpot1Current / jackpot2Current.
 * Jackpot snapshot chỉ ghi lên draw khi settle (finalize-settle).
 */

import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DrawStatus } from "@megawin/game-core/entities";
import { generateDrawId } from "@megawin/game-power655/helpers";
import type { DrawNo } from "@megawin/game-power655/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import { calcPower655DrawSlots } from "../../helpers/calc-draw-slots";
import type { CreateDrawsInput, CreateDrawsOutput, CreateDrawsOutputItem } from "./dto/draw.dto";

/**
 * Tạo batch kỳ quay Power 6/55.
 * Tự động tạo jackpot cycle nếu chưa có active cycle.
 */
export class CreateDrawsUseCase extends NextApiUseCase<CreateDrawsInput, CreateDrawsOutput> {
  private readonly drawRepo = new DrawRepository();
  private readonly cycleRepo = new JackpotCycleRepository();
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();

  /** @inheritdoc */
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

    const slots = calcPower655DrawSlots(new Date(), count, play, existingDrawIds);
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
        status,
      });
    }

    if (draws.length > 0) {
      const activeCycle = await this.cycleRepo.getActiveCycle();
      if (!activeCycle) {
        await this.cycleRepo.createCycle({
          startDrawId: draws[0]!.drawId,
          jp1SeedAmount: jackpotConfig.jackpot1.seedAmount,
          jp2SeedAmount: jackpotConfig.jackpot2.seedAmount,
        });
      }
    }

    return { draws };
  }
}

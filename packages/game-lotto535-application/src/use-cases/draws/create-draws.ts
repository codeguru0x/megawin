/**
 * Use Case: Create Draws (Lotto 5/35)
 *
 * Tạo kỳ quay cho 1 ngày (2 kỳ: 13h + 21h).
 *
 * Validate:
 *   - drawDate format YYYY-MM-DD
 *   - Chưa có draw nào cho ngày này
 *   - GameConfig tồn tại
 *
 * Draw được tạo trực tiếp ở status "salesOpen" – sẵn sàng nhận đặt cược.
 * Jackpot opening = closingAmount kỳ trước hoặc seedAmount nếu là kỳ đầu.
 */

import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DrawStatus, GameProduct } from "@megawin/game-core/entities";
import { generateDrawId } from "@megawin/game-lotto535/helpers";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { GameConfigRepository } from "../../infras/repos/game-config-repo";
import type { CreateDrawsInput, CreateDrawsOutput } from "./dto/draw.dto";

export class CreateDrawsUseCase extends NextApiUseCase<
  CreateDrawsInput,
  CreateDrawsOutput
> {
  private readonly drawRepo = new DrawRepository();
  private readonly configRepo = new GameConfigRepository();

  protected async execute(input: CreateDrawsInput): Promise<CreateDrawsOutput> {
    const { drawDate } = input;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(drawDate)) {
      throw AppException.badRequest("drawDate phải có format YYYY-MM-DD.");
    }
    const existingDraws = await this.drawRepo.getDrawsByDate(drawDate);
    if (existingDraws.length > 0) {
      throw AppException.conflict(`Đã tồn tại kỳ quay cho ngày ${drawDate}.`);
    }

    const globalConfig = await this.configRepo.getGlobalConfig();
    if (!globalConfig) {
      throw AppException.internal("GameConfig chưa được khởi tạo.");
    }

    const { play, jackpot: jackpotConfig } = globalConfig;

    const latestSettled = await this.drawRepo.getLatestSettledDrawBefore(drawDate);

    /**
     * JACKPOT CHAIN:
     * Lấy closingAmount từ kỳ settled gần nhất.
     * Nếu chưa có kỳ nào settled → dùng seedAmount.
     */
    const jackpotOpening = latestSettled?.jackpot.closingAmount
      ?? jackpotConfig.seedAmount;

    const now = new Date();
    const draws: CreateDrawsOutput["draws"] = [];

    for (let i = 0; i < play.drawsPerDay; i++) {
      const drawNo = i + 1;
      const drawId = generateDrawId(drawDate, drawNo);
      const drawTimeStr = play.drawTimes[i]!;
      const drawTime = new Date(`${drawDate}T${drawTimeStr}:00+07:00`);

      const salesCloseMs = play.salesCloseBeforeMinutes * 60 * 1000;
      const closeAt = new Date(drawTime.getTime() - salesCloseMs);

      const openAt = i === 0
        ? new Date(`${drawDate}T00:00:00+07:00`)
        : new Date((draws[i - 1]! as any)._drawTime);

      await this.drawRepo.createDraw({
        product: GameProduct.Lotto535,
        drawId,
        drawDate,
        drawNo,
        drawTime,
        status: DrawStatus.SalesOpen,
        sales: { openAt, closeAt },
        jackpot: {
          openingAmount: jackpotOpening,
        },
        createdAt: now,
        updatedAt: now,
      });

      draws.push({
        drawId,
        drawDate,
        drawNo,
        drawTime: drawTime.toISOString(),
        status: DrawStatus.SalesOpen,
      });
    }

    return { draws };
  }
}

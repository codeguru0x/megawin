/**
 * Use Case: Create Draw (Lotto 5/35)
 *
 * Tạo 1 kỳ quay duy nhất cho 1 ngày.
 * Lotto 5/35 có 2 kỳ/ngày (13h + 21h), staff chọn drawNo (1 hoặc 2).
 *
 * Validate:
 *   - drawDate format YYYY-MM-DD
 *   - drawNo hợp lệ (1 → drawsPerDay)
 *   - Kỳ quay (drawDate + drawNo) chưa tồn tại
 *   - GameConfig tồn tại
 *
 * Draw tạo ở status "scheduled" – chưa mở bán.
 * Staff cần nhấn "Mở nhận đặt cược" để chuyển sang salesOpen.
 *
 * Jackpot opening = closingAmount kỳ settled gần nhất hoặc seedAmount nếu là kỳ đầu.
 */

import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DrawStatus, GameProduct } from "@megawin/game-core/entities";
import { generateDrawId } from "@megawin/game-lotto535/helpers";
import { getFinancialDate } from "@megawin/shared/utils/financial-date";
import { toVNDate, subtractMinutes, nowVN } from "@megawin/shared/utils/date";
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
    const { drawDate, drawNo } = input;

    const globalConfig = await this.configRepo.getGlobalConfig();
    if (!globalConfig) {
      throw AppException.internal("GameConfig chưa được khởi tạo.");
    }

    const { play, jackpot: jackpotConfig } = globalConfig;

    if (drawNo < 1 || drawNo > play.drawsPerDay) {
      throw AppException.badRequest(
        `drawNo phải từ 1 đến ${play.drawsPerDay}. Nhận: ${drawNo}.`
      );
    }

    const latestDraw = await this.drawRepo.getLatestDraw();
    if (latestDraw) {
      const terminalStatuses: string[] = [DrawStatus.Settled, DrawStatus.Void];
      if (!terminalStatuses.includes(latestDraw.status)) {
        throw AppException.badRequest(
          `Kỳ quay ${latestDraw.drawId} đang ở trạng thái "${latestDraw.status}". ` +
            `Cần hoàn thành (settled/void) kỳ trước trước khi tạo kỳ mới.`
        );
      }
    }

    const drawId = generateDrawId(drawDate, drawNo);
    const existingDraw = await this.drawRepo.getDrawById(drawId);
    if (existingDraw) {
      throw AppException.conflict(
        `Kỳ quay ${drawId} (kỳ ${drawNo} ngày ${drawDate}) đã tồn tại.`
      );
    }

    const drawTimeStr = play.drawTimes[drawNo - 1]!;
    const drawTime = toVNDate(drawDate, drawTimeStr);
    const closeAt = subtractMinutes(drawTime, play.salesCloseBeforeMinutes);

    const latestSettled =
      await this.drawRepo.getLatestSettledDrawBefore(drawDate);
    const jackpotOpening =
      latestSettled?.jackpot.closingAmount ?? jackpotConfig.seedAmount;

    const now = nowVN();

    await this.drawRepo.createDraw({
      product: GameProduct.Lotto535,
      drawId,
      drawDate,
      financialDate: getFinancialDate(drawTime),
      drawNo,
      drawTime,
      status: DrawStatus.Scheduled,
      sales: { openAt: now, closeAt },
      jackpot: {
        openingAmount: jackpotOpening,
      },
      createdAt: now,
      updatedAt: now,
    });

    return {
      drawId,
      drawDate,
      drawNo,
      drawTime: drawTime.toISOString(),
      financialDate: getFinancialDate(drawTime),
      status: DrawStatus.Scheduled,
    };
  }
}

/**
 * Use Case: Create Draws (Lotto 5/35) – Batch
 *
 * Tạo nhiều kỳ quay liên tiếp cho ngày hiện tại và các ngày tiếp theo.
 *
 * Flow:
 *   1. Load global config → lấy play rules (drawTimes, salesCloseBeforeMinutes)
 *   2. Lấy danh sách draws đã tồn tại → calcDrawSlots skip draws đã có
 *   3. Tính draw slots khả dụng (calcLotto535DrawSlots)
 *   4. Build draw docs + batch insert
 *   5. Đảm bảo có active jackpot cycle (tạo nếu chưa có — chỉ lần đầu tiên)
 *
 * isSplitCycle KHÔNG được set lúc tạo draw — xác định tại prepare-settle
 * dựa trên trạng thái thực tế của jackpot cycle tại thời điểm settle.
 *
 * JACKPOT: Không ghi jackpot amount lên draw khi tạo.
 * Active draws đọc jackpot từ `lotto535_jackpot_cycles.currentAmount`.
 * Jackpot snapshot chỉ ghi lên draw khi settle (finalize-settle).
 */

import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DrawStatus } from "@megawin/game-core/entities";
import { generateDrawId } from "@megawin/game-lotto535/helpers";
import { getFinancialDate } from "@megawin/shared/utils/financial-date";
import type { DrawNo, DrawDoc } from "@megawin/game-lotto535/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import { calcLotto535DrawSlots } from "../../helpers/calc-draw-slots";
import type { CreateDrawsInput, CreateDrawsOutput, CreateDrawsOutputItem } from "./dto/draw.dto";

export class CreateDrawsUseCase extends NextApiUseCase<CreateDrawsInput, CreateDrawsOutput> {
  private readonly drawRepo = new DrawRepository();
  private readonly cycleRepo = new JackpotCycleRepository();
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();

  protected async execute(input: CreateDrawsInput): Promise<CreateDrawsOutput> {
    const { count, openSlotIndexes = [] } = input;
    const openSet = new Set(openSlotIndexes);

    if (count < 1 || count > 12) {
      throw AppException.badRequest("Số kỳ tạo phải từ 1 đến 12.");
    }

    const globalConfig = await this.getGlobalConfig.run();
    const { play, jackpot: jackpotConfig } = globalConfig;

    const existingActiveDraws = await this.drawRepo.getActiveDraws([
      DrawStatus.Scheduled,
      DrawStatus.SalesOpen,
      DrawStatus.SalesClosed,
      DrawStatus.Published,
      DrawStatus.Settling,
    ]);
    const existingDrawIds = new Set(existingActiveDraws.map((d) => d.drawId));

    const slots = calcLotto535DrawSlots(new Date(), count, play, existingDrawIds);
    if (slots.length === 0) {
      throw AppException.badRequest("Không còn slot quay nào khả dụng.");
    }

    // ── Build draw docs ──
    const now = new Date();
    const drawDocs: Omit<DrawDoc, "_id">[] = [];
    const draws: CreateDrawsOutputItem[] = [];

    for (let slotIdx = 0; slotIdx < slots.length; slotIdx++) {
      const slot = slots[slotIdx]!;
      const drawId = generateDrawId(slot.drawDate, slot.drawNo as any);
      if (existingDrawIds.has(drawId)) continue;

      const shouldOpen = openSet.has(slotIdx);
      const status = shouldOpen ? DrawStatus.SalesOpen : DrawStatus.Scheduled;

      drawDocs.push({
        drawId,
        drawDate: slot.drawDate,
        financialDate: getFinancialDate(slot.drawTime),
        drawNo: slot.drawNo as DrawNo,
        drawTime: slot.drawTime,
        status,
        sales: shouldOpen ? { closeAt: slot.closeAt, openAt: now } : { closeAt: slot.closeAt },
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

    // ── Batch insert draws ──
    if (drawDocs.length > 0) {
      await this.drawRepo.createDraws(drawDocs);
    }

    // ── Đảm bảo có active jackpot cycle  ──
    // Cycle sau split/winner đã được finalize-settle tạo tự động (nếu có kỳ mới đang chạy)
    // Nếu không thì phải tạo ở đây
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

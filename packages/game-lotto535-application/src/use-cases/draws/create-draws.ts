/**
 * Use Case: Create Draws (Lotto 5/35) – Batch
 *
 * Client gửi lên mảng các kỳ cần tạo (drawDate, drawNo, drawTime, openNow).
 * Server chỉ cần:
 *   1. Validate input (1-12 kỳ, không có (drawDate+drawNo) trùng nhau trong batch)
 *   2. Tính closeAt = drawTime − play.salesCloseBeforeMinutes (từ game config)
 *   3. Kiểm tra drawId nào đã tồn tại trong DB → báo lỗi toàn bộ, không tạo partial
 *   4. Batch insert tất cả kỳ mới
 *   5. Đảm bảo có active jackpot cycle
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
import { getFinancialDate, subtractMinutes } from "@megawin/shared/utils";
import type { DrawNo, DrawDoc } from "@megawin/game-lotto535/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import type { CreateDrawsInput, CreateDrawsOutput, CreateDrawsOutputItem } from "./dto/draw.dto";

export class CreateDrawsUseCase extends NextApiUseCase<CreateDrawsInput, CreateDrawsOutput> {
  private readonly drawRepo = new DrawRepository();
  private readonly cycleRepo = new JackpotCycleRepository();
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();

  protected async execute(input: CreateDrawsInput): Promise<CreateDrawsOutput> {
    const { draws: slots } = input;

    if (slots.length < 1 || slots.length > 12) {
      throw AppException.badRequest("Số kỳ tạo phải từ 1 đến 12.");
    }

    const { jackpot: jackpotConfig, play } = await this.getGlobalConfig.run();

    // Tính drawId cho từng slot, kiểm tra tất cả trước khi insert.
    const slotsWithIds = slots.map((slot) => {
      const drawTimeDate = new Date(slot.drawTime);
      // closeAt tính theo game config: drawTime − salesCloseBeforeMinutes (theo UTC, nhưng
      // subtractMinutes chỉ trừ milliseconds nên kết quả chính xác bất kể timezone).
      const closeAtDate = subtractMinutes(drawTimeDate, play.salesCloseBeforeMinutes);
      return {
        ...slot,
        drawId: generateDrawId(slot.drawDate, slot.drawNo as any),
        drawTimeDate,
        closeAtDate,
      };
    });

    // Query trực tiếp theo danh sách drawId — đơn giản hơn load all active draws.
    const inputDrawIds = slotsWithIds.map((s) => s.drawId);

    // Guard: bắt duplicate trong chính batch input (defense-in-depth, schema đã check nhưng use case không nên tin caller).
    const uniqueInputIds = new Set(inputDrawIds);
    if (uniqueInputIds.size !== inputDrawIds.length) {
      const seen = new Set<string>();
      const dupes = inputDrawIds.filter((id) => seen.size === seen.add(id).size);
      throw AppException.badRequest(`Kỳ quay bị trùng trong danh sách: ${[...new Set(dupes)].join(", ")}`);
    }

    const existing = await this.drawRepo.getDrawsByIds(inputDrawIds);
    if (existing.length > 0) {
      const ids = existing.map((d) => d.drawId).join(", ");
      throw AppException.conflict(`Kỳ quay đã tồn tại: ${ids}`);
    }

    // ── Build draw docs ──
    const now = new Date();
    const drawDocs: Omit<DrawDoc, "_id">[] = [];
    const draws: CreateDrawsOutputItem[] = [];

    for (const slot of slotsWithIds) {
      const status = slot.openNow ? DrawStatus.SalesOpen : DrawStatus.Scheduled;

      drawDocs.push({
        drawId: slot.drawId,
        drawDate: slot.drawDate,
        financialDate: getFinancialDate(slot.drawTimeDate),
        drawNo: slot.drawNo as DrawNo,
        drawTime: slot.drawTimeDate,
        status,
        sales: slot.openNow ? { closeAt: slot.closeAtDate, openAt: now } : { closeAt: slot.closeAtDate },
        createdAt: now,
        updatedAt: now,
      });

      draws.push({
        drawId: slot.drawId,
        drawDate: slot.drawDate,
        drawNo: slot.drawNo,
        drawTime: slot.drawTimeDate.toISOString(),
        closeAt: slot.closeAtDate.toISOString(),
        financialDate: getFinancialDate(slot.drawTimeDate),
        status,
      });
    }

    await this.drawRepo.createDraws(drawDocs);

    // ── Đảm bảo có active jackpot cycle ──
    // Cycle sau split/winner đã được finalize-settle tạo tự động.
    // Nếu không thì phải tạo ở đây (lần đầu khởi động game).
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

    return { draws };
  }
}

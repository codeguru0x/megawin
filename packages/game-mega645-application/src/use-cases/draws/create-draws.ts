/**
 * Use Case: Create Draws (Mega 6/45) – Batch
 *
 * Client gửi lên mảng các kỳ cần tạo (drawDate, drawNo, drawTime, openNow).
 * Server chỉ cần:
 *   1. Validate input (1-12 kỳ, không có (drawDate+drawNo) trùng nhau trong batch)
 *   2. Tính closeAt = drawTime − play.salesCloseBeforeMinutes (từ game config)
 *   3. Kiểm tra drawId nào đã tồn tại → báo lỗi, không tạo partial
 *   4. Batch insert tất cả kỳ mới với status tương ứng openNow
 *   5. Đảm bảo có active jackpot cycle
 */

import { UseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import type { DrawDoc } from "@megawin/game-mega645/entities";
import { DrawNo } from "@megawin/game-mega645/entities";
import { generateDrawId } from "@megawin/game-mega645/helpers";
import { MEGA645_CREATE_DRAW_BATCH_MAX } from "@megawin/game-mega645/schemas";
import { AppException } from "@megawin/shared/errors";
import { getFinancialDate, subtractMinutes, todayVN } from "@megawin/shared/utils";

import { DrawRepository } from "../../infras/repos/draw-repo";
import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import { GetGlobalConfigUseCase } from "../game-config/get-global-config";
import type { CreateDrawsInput, CreateDrawsOutput, CreateDrawsOutputItem } from "./dto/draw.dto";

export class CreateDrawsUseCase extends UseCase<CreateDrawsInput, CreateDrawsOutput> {
  private readonly drawRepo = new DrawRepository();
  private readonly cycleRepo = new JackpotCycleRepository();
  private readonly getGlobalConfig = new GetGlobalConfigUseCase();

  protected async execute(input: CreateDrawsInput): Promise<CreateDrawsOutput> {
    const { draws: slots } = input;

    // Trần lô = hằng số dùng chung với Zod schema route + UI (một nguồn chân lý).
    if (slots.length < 1 || slots.length > MEGA645_CREATE_DRAW_BATCH_MAX) {
      throw AppException.badRequest(`Số kỳ tạo phải từ 1 đến ${MEGA645_CREATE_DRAW_BATCH_MAX}.`);
    }

    // Chặn tạo kỳ cho ngày đã qua — ngày đó theo nghiệp vụ đã có kết quả, tạo mới là vô nghĩa
    // và làm lệch báo cáo (kỳ "quá khứ" mở bán được).
    const today = todayVN();
    for (const slot of slots) {
      if (slot.drawDate < today) {
        throw AppException.badRequest(`Không thể tạo kỳ quay cho ngày đã qua: ${slot.drawDate} (hôm nay ${today}).`);
      }
    }

    const { jackpot: jackpotConfig, play } = await this.getGlobalConfig.run();

    // Tính drawId và closeAt cho từng slot, kiểm tra tất cả trước khi insert.
    // drawNo Mega 6/45 LUÔN = 1 (DrawNo.Single) — không lấy từ client. Trước đây use case
    // tin thẳng `slot.drawNo` do client gửi, nên request có thể set drawNo khác 1, sinh
    // drawId sai lệch với nghiệp vụ thực (chỉ 1 kỳ/ngày).
    const slotsWithIds = slots.map((slot) => {
      const drawTimeDate = new Date(slot.drawTime);
      // closeAt tính theo game config: drawTime − salesCloseBeforeMinutes.
      const closeAtDate = subtractMinutes(drawTimeDate, play.salesCloseBeforeMinutes);
      return {
        ...slot,
        drawNo: DrawNo.Single,
        drawId: generateDrawId(slot.drawDate, DrawNo.Single),
        drawTimeDate,
        closeAtDate,
      };
    });

    const inputDrawIds = slotsWithIds.map((s) => s.drawId);

    // Guard: bắt duplicate trong chính batch input.
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
      // Tính 1 LẦN/kỳ rồi dùng lại cho cả doc lưu DB và output — trước đây gọi 2 lần/kỳ.
      const financialDate = getFinancialDate(slot.drawTimeDate);

      drawDocs.push({
        drawId: slot.drawId,
        drawDate: slot.drawDate,
        financialDate,
        drawNo: slot.drawNo,
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
        financialDate,
        status,
      });
    }

    await this.drawRepo.createDraws(drawDocs);

    // ── Đảm bảo có active jackpot cycle ──
    if (draws.length > 0) {
      const activeCycle = await this.cycleRepo.getActiveCycle();
      if (!activeCycle) {
        await this.cycleRepo.createCycle({
          startDrawId: draws[0]!.drawId,
          seedAmount: jackpotConfig.seedAmount,
        });
      }
    }

    return { draws };
  }
}

/**
 * Use Case: Create Draws (Lotto 5/35) – Batch
 *
 * Client gửi lên mảng các kỳ cần tạo (drawDate, drawTime, openNow).
 * Server chỉ cần:
 *   1. Validate input (1-12 kỳ, không có drawId trùng nhau trong batch)
 *   2. Suy ra drawNo từ giờ quay khớp `play.drawTimes` (index-based) — KHÔNG nhận từ client
 *   3. Tính closeAt = drawTime − play.salesCloseBeforeMinutes (từ game config)
 *   4. Kiểm tra drawId nào đã tồn tại trong DB → báo lỗi toàn bộ, không tạo partial
 *   5. Batch insert tất cả kỳ mới
 *   6. Đảm bảo có active jackpot cycle
 *
 * isSplitCycle KHÔNG được set lúc tạo draw — xác định tại prepare-settle
 * dựa trên trạng thái thực tế của jackpot cycle tại thời điểm settle.
 *
 * JACKPOT: Không ghi jackpot amount lên draw khi tạo.
 * Active draws đọc jackpot từ `lotto535_jackpot_cycles.currentAmount`.
 * Jackpot snapshot chỉ ghi lên draw khi settle (finalize-settle).
 */

import { UseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import type { DrawDoc, DrawNo } from "@megawin/game-lotto535/entities";
import { generateDrawId } from "@megawin/game-lotto535/helpers";
import { LOTTO535_CREATE_DRAW_BATCH_MAX } from "@megawin/game-lotto535/schemas";
import { AppException } from "@megawin/shared/errors";
import { formatVNTime, getFinancialDate, subtractMinutes, todayVN } from "@megawin/shared/utils";

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
    if (slots.length < 1 || slots.length > LOTTO535_CREATE_DRAW_BATCH_MAX) {
      throw AppException.badRequest(`Số kỳ tạo phải từ 1 đến ${LOTTO535_CREATE_DRAW_BATCH_MAX}.`);
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

    // Tính drawId cho từng slot, kiểm tra tất cả trước khi insert.
    // drawNo Lotto 5/35 suy ra từ giờ quay khớp `play.drawTimes` (index-based) — KHÔNG lấy
    // từ client. Trước đây client tự chọn drawNo qua dropdown UI rồi gửi thẳng lên; staff có
    // thể chọn "Kỳ 1" nhưng để giờ 21:00 (mismatch), hoặc API bị gọi trực tiếp với drawNo tuỳ
    // ý — cả 2 trường hợp sinh drawId sai lệch với giờ quay thật.
    const slotsWithIds = slots.map((slot) => {
      const drawTimeDate = new Date(slot.drawTime);
      // closeAt tính theo game config: drawTime − salesCloseBeforeMinutes (theo UTC, nhưng
      // subtractMinutes chỉ trừ milliseconds nên kết quả chính xác bất kể timezone).
      const closeAtDate = subtractMinutes(drawTimeDate, play.salesCloseBeforeMinutes);

      const drawTimeStr = formatVNTime(drawTimeDate);
      const drawNoIndex = play.drawTimes.indexOf(drawTimeStr);
      if (drawNoIndex === -1) {
        throw AppException.badRequest(
          `Giờ quay "${drawTimeStr}" (kỳ ${slot.drawDate}) không khớp lịch cấu hình (${play.drawTimes.join(", ")}).`,
        );
      }
      const drawNo = (drawNoIndex + 1) as DrawNo;

      return {
        ...slot,
        drawNo,
        drawId: generateDrawId(slot.drawDate, drawNo),
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

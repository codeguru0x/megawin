/**
 * Use Case: Create Draws (Max 3D Pro) – Batch
 *
 * Tạo nhiều kỳ quay liên tiếp cho ngày hiện tại và các ngày tiếp theo.
 * Max 3D Pro quay vào T3/T5/T7 lúc 18:00 (theo drawDaysOfWeek config).
 *
 * Flow:
 *   1. Nhận `draws[]` từ input — mỗi phần tử chứa drawDate, drawTime, openNow
 *   2. Tính drawNo từ lịch (1 kỳ/ngày) và generate drawId
 *   3. Guard: chặn ngày đã qua, trùng trong lô, và kỳ đã tồn tại trong DB (1 query)
 *   4. Ghi TOÀN BỘ lô trong 1 transaction (all-or-nothing) qua `drawRepo.createDraws`
 *
 * Max 3D Pro không có Jackpot tích luỹ → không tạo jackpot cycle.
 */

import { UseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import type { DrawDoc, DrawNo } from "@megawin/game-max3dpro/entities";
import { generateDrawId } from "@megawin/game-max3dpro/helpers";
import { MAX3D_PRO_CREATE_DRAW_BATCH_MAX } from "@megawin/game-max3dpro/schemas";
import { AppException } from "@megawin/shared/errors";
import { getFinancialDate, subtractMinutes, todayVN } from "@megawin/shared/utils";

import { calcMax3dproDrawSlots } from "../../helpers/calc-draw-slots";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { GetGlobalConfigUseCase } from "../game-config/get-global-config";
import type { CreateDrawsInput, CreateDrawsOutput, CreateDrawsOutputItem } from "./dto/draw.dto";

export class CreateDrawsUseCase extends UseCase<CreateDrawsInput, CreateDrawsOutput> {
  private readonly drawRepo = new DrawRepository();
  private readonly getGlobalConfig = new GetGlobalConfigUseCase();

  protected async execute(input: CreateDrawsInput): Promise<CreateDrawsOutput> {
    const { draws: inputDraws } = input;

    // Trần lô = hằng số dùng chung với Zod schema route + UI (một nguồn chân lý).
    if (inputDraws.length < 1 || inputDraws.length > MAX3D_PRO_CREATE_DRAW_BATCH_MAX) {
      throw AppException.badRequest(`Số kỳ tạo phải từ 1 đến ${MAX3D_PRO_CREATE_DRAW_BATCH_MAX}.`);
    }

    // Chặn tạo kỳ cho ngày đã qua — ngày đó theo nghiệp vụ đã có kết quả, tạo mới là vô nghĩa
    // và làm lệch báo cáo. Trước đây chỉ chặn ngầm qua cửa sổ slot nên message rất mơ hồ.
    const today = todayVN();
    for (const d of inputDraws) {
      if (d.drawDate < today) {
        throw AppException.badRequest(`Không thể tạo kỳ quay cho ngày đã qua: ${d.drawDate} (hôm nay ${today}).`);
      }
    }

    // Guard trùng ngày NGAY TRONG LÔ — Max 3D Pro chỉ 1 kỳ/ngày nên 2 dòng cùng drawDate là staff
    // nhập sai; nếu để đi tiếp thì cả 2 sinh cùng drawId, lô bị chính transaction từ chối với
    // message khó hiểu hơn.
    const inputDates = new Set<string>();
    for (const d of inputDraws) {
      if (inputDates.has(d.drawDate)) {
        throw AppException.badRequest(`Lô có 2 kỳ cùng ngày quay: ${d.drawDate}.`);
      }
      inputDates.add(d.drawDate);
    }

    const globalConfig = await this.getGlobalConfig.run();
    const { play } = globalConfig;

    // getUnfinishedDraws() default = TOÀN BỘ status chưa hoàn thành (KHÔNG lookback ngày) — không
    // bỏ sót kỳ Voiding (trước đây bị thiếu trong allowStatuses, có thể gây tạo trùng slot).
    const existingActiveDraws = await this.drawRepo.getUnfinishedDraws();
    const existingDrawIds = new Set(existingActiveDraws.map((d) => d.drawId));

    // Tính slots để lấy drawNo tương ứng với từng drawDate
    const slots = calcMax3dproDrawSlots(new Date(), inputDraws.length + 12, play, existingDrawIds);

    const now = new Date();
    const draws: CreateDrawsOutputItem[] = [];
    const docs: Omit<DrawDoc, "_id">[] = [];

    for (const item of inputDraws) {
      // Tìm slot tương ứng với drawDate từ input
      const matchingSlot = slots.find((s) => s.drawDate === item.drawDate);

      if (!matchingSlot) {
        throw AppException.badRequest(
          `Ngày "${item.drawDate}" không phải ngày quay hợp lệ (T3/T5/T7) hoặc kỳ đã tồn tại.`,
        );
      }

      const drawId = generateDrawId(item.drawDate, matchingSlot.drawNo as DrawNo);
      const drawTime = new Date(item.drawTime);
      const closeAt = subtractMinutes(drawTime, play.salesCloseBeforeMinutes);
      const status = item.openNow ? DrawStatus.SalesOpen : DrawStatus.Scheduled;
      // Tính 1 LẦN/kỳ rồi dùng lại cho cả doc lưu DB và output — trước đây gọi 2 lần/kỳ.
      const financialDate = getFinancialDate(drawTime);

      docs.push({
        drawId,
        drawDate: item.drawDate,
        financialDate,
        drawNo: matchingSlot.drawNo as DrawNo,
        drawTime,
        status,
        sales: {
          closeAt,
          ...(item.openNow ? { openAt: now } : {}),
        },
        createdAt: now,
        updatedAt: now,
      });

      draws.push({
        drawId,
        drawDate: item.drawDate,
        drawNo: matchingSlot.drawNo,
        drawTime: drawTime.toISOString(),
        closeAt: closeAt.toISOString(),
        financialDate,
        status,
      });
    }

    // Guard kỳ đã tồn tại trong DB — 1 query cho cả lô, thay cho `getDrawById` mỗi vòng lặp
    // (N round-trip) vốn còn âm thầm `continue` khiến staff tưởng đã tạo đủ.
    const existing = await this.drawRepo.getDrawsByIds(docs.map((d) => d.drawId));
    if (existing.length > 0) {
      throw AppException.conflict(`Kỳ đã tồn tại: ${existing.map((d) => d.drawId).join(", ")}.`);
    }

    // Ghi 1 LẦN cho cả lô trong transaction — thành công toàn bộ hoặc rollback sạch.
    await this.drawRepo.createDraws(docs);

    return { draws };
  }
}

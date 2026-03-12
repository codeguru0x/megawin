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
 *   5. Đảm bảo có active JackpotCycle:
 *      - Bootstrap (lần đầu, chưa có cycle nào): tạo mới với seed từ config.
 *      - Recovery (cycle closed nhưng chưa có cycle mới — crash giữa settle):
 *        đọc cycle closed gần nhất để xác định JP2 carry-over chính xác.
 *
 * JACKPOT: Không ghi jackpot lên draw khi tạo.
 * Active draws đọc jackpot từ JackpotCycle.jackpot1CurrentAmount / jackpot2CurrentAmount.
 * Jackpot snapshot chỉ ghi lên draw khi settle (finalize-settle).
 */

import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DrawStatus } from "@megawin/game-core/entities";
import { generateDrawId } from "@megawin/game-power655/helpers";
import { getFinancialDate } from "@megawin/shared/utils/financial-date";
import type { DrawNo } from "@megawin/game-power655/entities";
import { JackpotCycleClosedReasons } from "@megawin/game-power655/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import { calcPower655DrawSlots } from "../../helpers/calc-draw-slots";
import type { CreateDrawsInput, CreateDrawsOutput, CreateDrawsOutputItem } from "./dto/draw.dto";

/**
 * Tạo batch kỳ quay Power 6/55.
 *
 * Tự động đảm bảo có active JackpotCycle:
 *   - Bootstrap: chưa có cycle nào → tạo mới với seed từ GlobalConfig.
 *   - Recovery: cycle closed nhưng chưa có cycle mới (crash giữa settle)
 *     → tạo cycle mới với JP2 carry-over từ cycle closed gần nhất.
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
        status,
      });
    }

    // ── Đảm bảo luôn có active JackpotCycle ──────────────────────────────────
    // createCycle guard: skip nếu đã có active cycle → idempotent.
    if (draws.length > 0) {
      await this.ensureActiveCycleExists(draws[0]!.drawId, jackpotConfig);
    }

    return { draws };
  }

  /**
   * Đảm bảo có active JackpotCycle. Xử lý 2 trường hợp:
   *
   * 1. **Bootstrap / BothWinner / ManualReset**: JP2 seed từ config.
   * 2. **Recovery sau Jackpot1Winner** (cycle closed nhưng chưa tạo cycle mới):
   *    JP2 carry-over = jackpot2CurrentAmount từ closed cycle (pool đang tích lũy).
   *
   * JP2 CHỈ carry-over khi closedReason = Jackpot1Winner — mọi trường hợp khác
   * (Bootstrap, BothWinner, ManualReset) đều dùng seed từ config.
   *
   * Idempotent: createCycle guard getActiveCycle() → skip nếu đã tạo.
   */
  private async ensureActiveCycleExists(
    firstDrawId: string,
    jackpotConfig: {
      jackpot1: { seedAmount: number };
      jackpot2: { seedAmount: number };
      jp1ContributionRatio: number;
      jp2ContributionRatio: number;
      jp1OverflowThreshold: number;
    },
  ): Promise<void> {
    const activeCycle = await this.cycleRepo.getActiveCycle();
    if (activeCycle) {
      return;
    }

    // Không có active cycle → kiểm tra đã từng có cycle closed chưa.
    const lastClosedCycle = await this.cycleRepo.findLastClosedCycle();

    // JP1 luôn seed từ config (JP1 winner = lý do đóng cycle → luôn reset).
    const jp1SeedAmount = jackpotConfig.jackpot1.seedAmount;

    let jp2SeedAmount: number;

    if (
      lastClosedCycle != null &&
      lastClosedCycle.closedReason === JackpotCycleClosedReasons.Jackpot1Winner
    ) {
      // JP1 winner only: JP2 không reset → carry-over giá trị pool đang tích lũy sang cycle mới.
      // jackpot2CurrentAmount trong closed cycle = finalJp2 (pool JP2 tại thời điểm đóng).
      jp2SeedAmount = lastClosedCycle.jackpot2CurrentAmount;
    } else {
      // Mọi trường hợp còn lại: JP2 seed từ config.
      //   - Bootstrap (chưa có cycle nào)
      //   - BothWinner (JP1 + JP2 cùng kỳ → JP2 đã trao thưởng, reset về seed)
      //   - ManualReset (admin reset thủ công → bắt đầu lại từ đầu)
      jp2SeedAmount = jackpotConfig.jackpot2.seedAmount;
    }

    await this.cycleRepo.createCycle({
      startDrawId: firstDrawId,
      jp1SeedAmount,
      jp2SeedAmount,
      config: {
        jp1ContributionRatio: jackpotConfig.jp1ContributionRatio,
        jp2ContributionRatio: jackpotConfig.jp2ContributionRatio,
        jp1OverflowThreshold: jackpotConfig.jp1OverflowThreshold,
      },
    });
  }
}

/**
 * Use Case: Create Draws (Power 6/55) – Batch
 *
 * Client gửi lên mảng các kỳ cần tạo (drawDate, drawNo, drawTime, openNow).
 * Server chỉ cần:
 *   1. Validate input (1-12 kỳ, không có drawDate trùng nhau trong batch)
 *   2. Tính closeAt = drawTime − play.salesCloseBeforeMinutes (từ game config)
 *   3. Kiểm tra drawId nào đã tồn tại → báo lỗi, không tạo partial
 *   4. Batch insert tất cả kỳ mới với status tương ứng openNow
 *   5. Đảm bảo có active JackpotCycle
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
import { subtractMinutes } from "@megawin/shared/utils/date";
import type { DrawNo, DrawDoc } from "@megawin/game-power655/entities";
import { JackpotCycleClosedReasons } from "@megawin/game-power655/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
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
    const { draws: slots } = input;

    if (slots.length < 1 || slots.length > 12) {
      throw AppException.badRequest("Số kỳ tạo phải từ 1 đến 12.");
    }

    const globalConfig = await this.getGlobalConfig.run();
    const { play, jackpot: jackpotConfig } = globalConfig;

    // Tính drawId và closeAt cho từng slot, kiểm tra tất cả trước khi insert.
    const slotsWithIds = slots.map((slot) => {
      const drawTimeDate = new Date(slot.drawTime);
      // closeAt tính theo game config: drawTime − salesCloseBeforeMinutes.
      const closeAtDate = subtractMinutes(drawTimeDate, play.salesCloseBeforeMinutes);
      return {
        ...slot,
        drawId: generateDrawId(slot.drawDate, slot.drawNo as any),
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
      throw AppException.badRequest(
        `Kỳ quay bị trùng trong danh sách: ${[...new Set(dupes)].join(", ")}`,
      );
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
        sales: slot.openNow
          ? { closeAt: slot.closeAtDate, openAt: now }
          : { closeAt: slot.closeAtDate },
        createdAt: now,
        updatedAt: now,
      });

      draws.push({
        drawId: slot.drawId,
        drawDate: slot.drawDate,
        drawNo: slot.drawNo,
        drawTime: slot.drawTimeDate.toISOString(),
        closeAt: slot.closeAtDate.toISOString(),
        status,
      });
    }

    await this.drawRepo.createDraws(drawDocs);

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

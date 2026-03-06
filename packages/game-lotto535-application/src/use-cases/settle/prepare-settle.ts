/**
 * Use Case: Prepare Settle (Lotto 5/35)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * STEP 1 TRONG SETTLE FLOW
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Load toàn bộ context cần thiết cho settle flow. Pure read — không mutate entries.
 * settle-entries sẽ ghi result + chuyển scheduled → settled trực tiếp.
 *
 * NHIỆM VỤ:
 *   - Validate draw tồn tại + status = "settling"
 *   - Load kết quả quay (5 số chính + 1 số đặc biệt)
 *   - Load Jackpot opening amount (từ active cycle)
 *   - Xác định isSplitCycle (drawNo === Evening && currentAmount >= splitThreshold từ cycle config)
 *   - Build bảng giải thưởng (tier → amount VND)
 *
 * OUTPUT → truyền cho TẤT CẢ steps sau (qua Step Function $settleCtx):
 *   { drawId, drawDate, drawNo, financialDate, result, jackpotOpeningAmount,
 *     isSplitCycle, prizeAmounts, config }
 *
 * IDEMPOTENT: chỉ đọc draw, config, jackpot cycle, đếm entries.
 *
 * CRASH-SAFE: Nếu step function crash giữa chừng và chạy lại,
 * prepare-settle sẽ:
 *   - Accept draw ở status "settling" (đang settle dở)
 *   - Accumulator bắt đầu từ zero – settle-entries chỉ query "scheduled" nên safe
 */

import { AppException, InternalUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import { DrawNo } from "@megawin/game-lotto535/entities";
import { buildPrizeAmountMap } from "@megawin/game-lotto535/rules";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import type { SettleContext } from "./types";

export interface PrepareSettleInput {
  /** Mã kỳ quay cần settle — phải ở trạng thái "settling". */
  drawId: string;
}

export class PrepareSettleUseCase extends InternalUseCase<PrepareSettleInput, SettleContext> {
  private readonly drawRepo = new DrawRepository();
  private readonly cycleRepo = new JackpotCycleRepository();
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();

  /** Load context cho settle flow. Throw nếu draw không hợp lệ. */
  protected async execute(input: PrepareSettleInput): Promise<SettleContext> {
    const { drawId } = input;

    // ── 1. Validate draw tồn tại ──
    const draw = await this.drawRepo.getDrawById(drawId);
    if (!draw) {
      throw AppException.notFound(`Draw ${drawId} không tồn tại.`);
    }

    // ── 2. Validate status = "settling" ──
    // Draw phải đã được API chuyển sang "settling" trước khi start step function.
    // Nếu crash giữa chừng, draw vẫn ở "settling" nên retry safe.
    if (draw.status !== DrawStatus.Settling) {
      throw AppException.businessRuleViolation(
        `Draw ${drawId} status = "${draw.status}", expected "settling".`,
      );
    }

    // ── 3. Validate draw đã có kết quả quay ──
    // Kết quả quay (5 số chính 1-35 + 1 số đặc biệt 1-12) phải được publish trước khi settle.
    if (!draw.result) {
      throw AppException.businessRuleViolation(`Draw ${drawId} chưa có kết quả quay.`);
    }

    // ── 4. Load config + active jackpot cycle song song (tối ưu I/O) ──
    const [globalConfig, existingCycle] = await Promise.all([
      this.getGlobalConfig.run(),
      this.cycleRepo.getActiveCycle(),
    ]);

    if (!globalConfig) {
      throw AppException.businessRuleViolation(`Không tìm thấy cấu hình game.`);
    }

    // Safety net: nếu cycle bị đóng mà chưa tạo mới (VD: finalize-settle đóng cycle
    // nhưng không có draw tiếp theo để tạo cycle mới ngay) → tạo tại đây.
    // trong create-draws đã có rồi tuy nhiên để tránh lỗi khi crash giữa chừng tạo mới thêm ở đây
    let activeCycle = existingCycle;
    if (!activeCycle) {
      await this.cycleRepo.createCycle({
        startDrawId: drawId,
        seedAmount: globalConfig.jackpot.seedAmount,
        config: {
          splitThreshold: globalConfig.jackpot.splitThreshold,
          splitRatios: globalConfig.jackpot.splitRatios,
        },
      });
      activeCycle = await this.cycleRepo.getActiveCycle();
      if (!activeCycle) {
        throw AppException.businessRuleViolation(`Không thể tạo Jackpot Cycle mới.`);
      }
    }

    // ── 5. Xác định Jackpot đầu kỳ ──
    const jackpotOpeningAmount = activeCycle.currentAmount;

    // ── 6. Xác định isSplitCycle ──
    // Split chỉ xảy ra ở kỳ Evening (drawNo === 2) khi Jackpot >= splitThreshold.
    // Tính tại runtime vì Jackpot thay đổi sau mỗi kỳ settle —
    // không thể xác định chính xác lúc tạo draw.
    const isSplitCycle =
      draw.drawNo === DrawNo.Evening && jackpotOpeningAmount >= activeCycle.config.splitThreshold;

    // ── 7. Build bảng giải thưởng (tier → amount VND) ──
    const prizeMap = buildPrizeAmountMap(globalConfig.defaultPrizes);
    const prizeAmounts: Record<string, number> = {};
    for (const [tier, amount] of prizeMap) {
      prizeAmounts[tier] = amount;
    }

    return {
      drawId,
      drawDate: draw.drawDate,
      drawNo: draw.drawNo,
      financialDate: draw.financialDate,
      result: {
        winningMain: draw.result.winningMain as unknown as string[],
        winningSpecial: draw.result.winningSpecial,
      },
      jackpotOpeningAmount,
      isSplitCycle,
      prizeAmounts,
      config: {
        seedAmount: activeCycle.seedAmount,
        splitRatios: activeCycle.config.splitRatios,
        companyRate: globalConfig.rates.companyRate,
      },
    };
  }
}

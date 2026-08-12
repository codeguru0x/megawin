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
import { buildPrizeAmountMap, isSplitEligibleDraw } from "@megawin/game-lotto535/rules";

import { DrawRepository } from "../../infras/repos/draw-repo";
import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import type { ResettleContext, SettleContext } from "./types";

export interface PrepareSettleInput {
  drawId: string;
  /** Nested từ Resettle SFN — override opening + isSplitCycle. */
  resettleContext?: ResettleContext;
}

export class PrepareSettleUseCase extends InternalUseCase<PrepareSettleInput, SettleContext> {
  private readonly drawRepo = new DrawRepository();
  private readonly cycleRepo = new JackpotCycleRepository();
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();

  /** Load context cho settle flow. Throw nếu draw không hợp lệ. */
  protected async execute(input: PrepareSettleInput): Promise<SettleContext> {
    const { drawId, resettleContext } = input;

    // ── 1. Validate draw tồn tại ──
    const draw = await this.drawRepo.getDrawById(drawId);
    if (!draw) {
      throw AppException.notFound(`Draw ${drawId} không tồn tại.`);
    }

    // ── 2. Validate status = "settling" ──
    // Draw phải đã được API chuyển sang "settling" trước khi start step function.
    // Nếu crash giữa chừng, draw vẫn ở "settling" nên retry safe.
    if (draw.status !== DrawStatus.Settling) {
      throw AppException.businessRuleViolation(`Draw ${drawId} status = "${draw.status}", expected "settling".`);
    }

    // ── 3. Validate draw đã có kết quả quay ──
    // Kết quả quay (5 số chính 1-35 + 1 số đặc biệt 1-12) phải được publish trước khi settle.
    if (!draw.result) {
      throw AppException.businessRuleViolation(`Draw ${drawId} chưa có kết quả quay.`);
    }

    // ── 4. Load config + jackpot cycle song song (tối ưu I/O) ──
    // Resettle: đọc cycle CHỨA kỳ T theo cycleNo (kể cả đã closed) — KHÔNG dùng
    //   getActiveCycle vì cycle của T có thể đã đóng (trúng Jackpot) và chưa có
    //   cycle mới (chưa có kỳ sau T).
    // Settle lần đầu: kỳ T nằm trong cycle đang active → getActiveCycle đúng.
    //   Cycle luôn được CreateDrawsUseCase.ensureActiveCycleExists đảm bảo tồn tại
    //   trước khi kỳ vào "settling"; nếu null ở đây → data integrity bất thường,
    //   ném lỗi (KHÔNG tự createCycle: sẽ dùng seed mặc định sai sau split).
    const [globalConfig, settleCycle] = await Promise.all([
      this.getGlobalConfig.run(),
      resettleContext ? this.cycleRepo.getCycleByNo(resettleContext.cycleNo) : this.cycleRepo.getActiveCycle(),
    ]);

    if (!globalConfig) {
      throw AppException.businessRuleViolation(`Không tìm thấy cấu hình game.`);
    }

    if (!settleCycle) {
      throw AppException.businessRuleViolation(
        resettleContext
          ? `Không tìm thấy Jackpot Cycle #${resettleContext.cycleNo} của kỳ ${drawId}.`
          : `Không tìm thấy Jackpot Cycle.`,
      );
    }

    // ── 5. Xác định Jackpot đầu kỳ ──
    let jackpotOpeningAmount = settleCycle.currentAmount;
    let cycleContributionBefore = settleCycle.totalContribution;
    let cycleDrawCountBefore = settleCycle.drawCount;
    const cycleNo = settleCycle.cycleNo;

    if (resettleContext) {
      // Resettle: opening từ ledger / cascade — KHÔNG đọc settleCycle.currentAmount.
      jackpotOpeningAmount = resettleContext.opening;
      cycleContributionBefore = resettleContext.cycleContributionBefore;
      cycleDrawCountBefore = resettleContext.cycleDrawCountBefore;
    }

    // ── 6. Xác định isSplitCycle ──
    // Split phụ thuộc opening — resettle PHẢI tính lại từ opening mới.
    // Prepare CHƯA biết winner → chỉ xét ngưỡng + kỳ 21h (isSplitEligibleDraw).
    const isSplitCycle = isSplitEligibleDraw(jackpotOpeningAmount, settleCycle.config.splitThreshold, draw.drawNo);

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
        seedAmount: settleCycle.seedAmount,
        splitRatios: settleCycle.config.splitRatios,
        companyRate: globalConfig.rates.companyRate,
        splitThreshold: settleCycle.config.splitThreshold,
        cycleNo,
        cycleContributionBefore,
        cycleDrawCountBefore,
      },
      resettleContext,
    };
  }
}

/**
 * Use Case: Prepare Settle (Power 6/55)
 *
 * Load toàn bộ context cần thiết cho settle flow. Pure read — không mutate entries.
 * settle-entries sẽ ghi result + chuyển scheduled → settled trực tiếp.
 *
 * Khác biệt so với Lotto 5/35:
 *   - Load dual jackpot opening amounts (JP1 + JP2)
 *   - Config chứa jp1Ratio, jp2Ratio, jp1OverflowThreshold
 *   - Result chứa bonusNumber thay vì winningSpecial
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
import type { PrizeAmounts } from "@megawin/game-power655/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import type { ResettleContext, SettleContext } from "./types";

export interface PrepareSettleInput {
  /** ID kỳ quay cần chuẩn bị settle. */
  drawId: string;
  /**
   * Context resettle — chỉ có khi pipeline được gọi từ TriggerResettleUseCase.
   * PrepareSettle dùng để override jp1/2CurrentAmount và cycleDrawCountBefore.
   * undefined → flow settle bình thường (kỳ quay lần đầu).
   */
  resettleContext?: ResettleContext;
}

/**
 * Load context cho settle flow Power 6/55.
 * Loads dual jackpot (JP1 + JP2) opening amounts từ active cycle.
 *
 * Khi có `resettleContext` (resettle pipeline):
 *   - jp1/2CurrentAmount đọc từ `resettleContext.openingJp1/2` (ledger snapshot)
 *     thay vì `settleCycle.jackpot*CurrentAmount` — settleCycle có thể đã bị
 *     cập nhật bởi các kỳ T+1, T+2 sau khi kỳ T settle lần đầu.
 *   - cycleDrawCountBefore đọc từ `resettleContext.cycleDrawCountBefore`
 *     (= ledger(T).seq - 1) để FinalizeSettle set drawCount đúng vị trí kỳ T.
 */
export class PrepareSettleUseCase extends InternalUseCase<PrepareSettleInput, SettleContext> {
  private readonly drawRepo = new DrawRepository();
  private readonly cycleRepo = new JackpotCycleRepository();
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();

  protected async execute(input: PrepareSettleInput): Promise<SettleContext> {
    const { drawId, resettleContext } = input;

    const draw = await this.drawRepo.getDrawById(drawId);
    if (!draw) {
      throw AppException.notFound(`Draw ${drawId} không tồn tại.`);
    }

    if (draw.status !== DrawStatus.Settling) {
      throw AppException.businessRuleViolation(`Draw ${drawId} status = "${draw.status}", expected "settling".`);
    }

    if (!draw.result) {
      throw AppException.businessRuleViolation(`Draw ${drawId} chưa có kết quả quay.`);
    }

    const [globalConfig, settleCycle] = await Promise.all([
      this.getGlobalConfig.run(),
      // Resettle: đọc cycle CHỨA kỳ T theo cycleNo (kể cả đã closed) — không
      //   dùng getActiveCycle vì cycle của T có thể đã đóng (JP1 winner) và chưa
      //   có cycle mới (chưa có kỳ sau T).
      // Settle lần đầu: kỳ T nằm trong cycle đang active → getActiveCycle đúng.
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

    // ── Opening JP1/JP2: đọc từ ledger khi resettle, settleCycle khi settle lần đầu ──
    // Resettle: settleCycle.jackpot*CurrentAmount đã bị cập nhật bởi các kỳ T+1, T+2,...
    //   → KHÔNG dùng — sẽ tính sai contribution và pool. Dùng ledger(T).openingJp1/2.
    // Settle lần đầu: settleCycle luôn đúng — kỳ T chính là kỳ đang settle.
    let jp1CurrentAmount = settleCycle.jackpot1CurrentAmount;
    let jp2CurrentAmount = settleCycle.jackpot2CurrentAmount;
    let cycleDrawCountBefore = settleCycle.drawCount;

    if (resettleContext) {
      // ── Resettle: đọc opening từ ledger snapshot ──────────────────────────────
      // resettleContext đã được TriggerResettle build từ ledger(T).openingJp1/2.
      // PrepareSettle chỉ forward giá trị đó vào context — không query ledger lại.
      jp1CurrentAmount = resettleContext.openingJp1;
      jp2CurrentAmount = resettleContext.openingJp2;
      cycleDrawCountBefore = resettleContext.cycleDrawCountBefore;
    }

    const fixedPrizeAmounts: PrizeAmounts = {
      tier1: globalConfig.defaultPrizes.tier1,
      tier2: globalConfig.defaultPrizes.tier2,
      tier3: globalConfig.defaultPrizes.tier3,
    };

    return {
      drawId,
      drawDate: draw.drawDate,
      drawNo: draw.drawNo,
      financialDate: draw.financialDate,
      result: {
        winningMain: [...draw.result.winningMain],
        bonusNumber: draw.result.bonusNumber,
      },
      jp1CurrentAmount,
      jp2CurrentAmount,
      fixedPrizeAmounts,
      config: {
        companyRate: globalConfig.rates.companyRate,
        jp1SeedAmount: globalConfig.jackpot.jackpot1.seedAmount,
        jp2SeedAmount: globalConfig.jackpot.jackpot2.seedAmount,
        // Đọc ratios từ cycle.config (snapshot tại thời điểm tạo cycle).
        // Operator có thể thay đổi GlobalConfig sau khi cycle bắt đầu,
        // nhưng cycle đang chạy phải dùng config gốc để đảm bảo tính nhất quán.
        jp1Ratio: settleCycle.config.jp1ContributionRatio,
        jp2Ratio: settleCycle.config.jp2ContributionRatio,
        jp1OverflowThreshold: settleCycle.config.jp1OverflowThreshold,
        cycleNo: settleCycle.cycleNo,
        cycleDrawCountBefore,
      },
      // Forward resettleContext vào SettleContext để FinalizeSettle đọc.
      resettleContext,
    };
  }
}

/**
 * Use Case: Prepare Settle (Mega 6/45)
 *
 * Load toàn bộ context cần thiết cho settle flow. Pure read — không mutate entries.
 * settle-entries sẽ ghi result + chuyển scheduled → settled trực tiếp.
 *
 * IDEMPOTENT: chỉ đọc draw, config, jackpot cycle.
 * Step Function retry tại chính step này nếu lỗi — draw vẫn là "settling".
 *
 * Mega 6/45 theo luật Vietlott: không có Split Cycle, không cần isSplitCycle.
 */

import { AppException, InternalUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import type { PrizeAmounts } from "@megawin/game-mega645/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import type { ResettleContext, SettleContext } from "./types";

export interface PrepareSettleInput {
  /** ID kỳ quay cần chuẩn bị settle. */
  drawId: string;
  /**
   * Context resettle — chỉ có khi pipeline được gọi từ TriggerResettleUseCase.
   * PrepareSettle dùng để override jackpotOpeningAmount, cycleDrawCountBefore,
   * cycleContributionBefore (settleCycle đã bị các kỳ T+1, T+2 cập nhật lệch).
   * undefined → flow settle bình thường (kỳ quay lần đầu).
   */
  resettleContext?: ResettleContext;
}

/**
 * Load context cho settle flow Mega 6/45 (single jackpot).
 *
 * Khi có `resettleContext` (resettle pipeline):
 *   - jackpotOpeningAmount đọc từ `resettleContext.openingJp` (ledger snapshot)
 *     thay vì `settleCycle.currentAmount` — settleCycle có thể đã bị cập nhật
 *     bởi các kỳ T+1, T+2 sau khi kỳ T settle lần đầu.
 *   - cycleDrawCountBefore / cycleContributionBefore đọc từ resettleContext
 *     (= ledger(T).seq - 1 và openingJp - seedAmount) để FinalizeSettle set
 *     drawCount/contribution đúng vị trí kỳ T (idempotent).
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
      throw AppException.businessRuleViolation(
        `Draw ${drawId} status = "${draw.status}", expected "settling".`,
      );
    }

    if (!draw.result) {
      throw AppException.businessRuleViolation(`Draw ${drawId} chưa có kết quả quay.`);
    }

    const [globalConfig, settleCycle] = await Promise.all([
      this.getGlobalConfig.run(),
      // Resettle: đọc cycle CHỨA kỳ T theo cycleNo (kể cả đã closed) — không
      //   dùng getActiveCycle vì cycle của T có thể đã đóng (JP winner) và chưa
      //   có cycle mới (chưa có kỳ sau T).
      // Settle lần đầu: kỳ T nằm trong cycle đang active → getActiveCycle đúng.
      resettleContext
        ? this.cycleRepo.getCycleByNo(resettleContext.cycleNo)
        : this.cycleRepo.getActiveCycle(),
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

    // ── Opening + cycle snapshot: ledger khi resettle, settleCycle khi settle lần đầu ──
    // Resettle: settleCycle ở đây là cycle CHỨA kỳ T (đọc theo cycleNo, kể cả đã
    //   closed). currentAmount / totalContribution / drawCount của nó đã bị các kỳ
    //   T+1, T+2,... cập nhật → KHÔNG dùng. Dùng snapshot từ ledger(T) đã build sẵn.
    //   cycleNo / seedAmount đọc từ cycle này vẫn đúng (config bất biến trong cycle).
    // Settle lần đầu: settleCycle là cycle đang active — kỳ T chính là kỳ đang settle.
    const cycleNo = settleCycle.cycleNo;
    let jackpotOpeningAmount = settleCycle.currentAmount;
    let cycleContributionBefore = settleCycle.totalContribution;
    let cycleDrawCountBefore = settleCycle.drawCount;

    if (resettleContext) {
      // resettleContext đã được TriggerResettle build từ ledger(T).openingJp
      // (= seedAmount + Σ contribution các kỳ trước T). PrepareSettle chỉ forward.
      jackpotOpeningAmount = resettleContext.openingJp;
      cycleContributionBefore = resettleContext.cycleContributionBefore;
      cycleDrawCountBefore = resettleContext.cycleDrawCountBefore;
    } 

    const prizeAmounts: PrizeAmounts = globalConfig.defaultPrizes;

    return {
      drawId,
      drawDate: draw.drawDate,
      drawNo: draw.drawNo,
      financialDate: draw.financialDate,
      result: {
        winningNumbers: draw.result.winningNumbers as unknown as string[],
      },
      jackpotOpeningAmount,
      prizeAmounts,
      config: {
        seedAmount: globalConfig.jackpot.seedAmount,
        companyRate: globalConfig.rates.companyRate,
        cycleNo,
        cycleContributionBefore,
        cycleDrawCountBefore,
      },
      // Forward resettleContext vào SettleContext để FinalizeSettle đọc.
      resettleContext,
    };
  }
}

/**
 * Use Case: Prepare Settle (Lotto 5/35)
 *
 * Load toàn bộ context cần thiết cho settle flow. Pure read — không mutate entries.
 * settle-entries sẽ ghi result + chuyển scheduled → settled trực tiếp.
 *
 * IDEMPOTENT: chỉ đọc draw, config, jackpot cycle, đếm entries.
 *
 * CRASH-SAFE: Nếu step function crash giữa chừng và chạy lại,
 * prepare-settle sẽ:
 *   - Accept draw ở status "settling" (đang settle dở)
 *   - Accumulator bắt đầu từ zero – settle-entries chỉ query "scheduled" nên safe
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import { buildPrizeAmountMap } from "@megawin/game-lotto535/rules";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import type { LottoDrawResult, LottoSettleConfig } from "./types";

export interface PrepareSettleInput {
  /** Mã kỳ quay cần settle — phải ở trạng thái "settling". */
  drawId: string;
}

export interface PrepareSettleResult {
  /** Mã kỳ quay. */
  drawId: string;
  /** Ngày quay (YYYY-MM-DD). */
  drawDate: string;
  /** Số thứ tự kỳ trong ngày. */
  drawNo: number;
  /** Ngày tài chính (YYYY-MM-DD) — dùng cho báo cáo. */
  financialDate: string;
  /** Kết quả quay đã công bố. */
  result: LottoDrawResult;
  /** Số tiền Jackpot đầu kỳ (VND) — đọc từ active cycle hoặc seed. */
  jackpotOpeningAmount: number;
  /** Kỳ này có phải kỳ chia Jackpot hay không. */
  isSplitCycle: boolean;
  /** Bảng giải thưởng: key = tier name, value = số tiền (VND). */
  prizeAmounts: Record<string, number>;
  /** Cấu hình liên quan settle (snapshot từ GlobalConfig). */
  config: LottoSettleConfig;
  /** Tổng entries cần settle. */
  totalEntries: number;
  /** Tổng lines cần xử lý từ tất cả entries. */
  totalLines: number;
}

export class PrepareSettleUseCase extends InternalUseCase<PrepareSettleInput, PrepareSettleResult> {
  private readonly drawRepo = new DrawRepository();
  private readonly entryRepo = new EntryRepository();
  private readonly cycleRepo = new JackpotCycleRepository();
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();

  /** Load context cho settle flow. Throw nếu draw không hợp lệ. */
  protected async execute(input: PrepareSettleInput): Promise<PrepareSettleResult> {
    const { drawId } = input;

    const draw = await this.drawRepo.getDrawById(drawId);
    if (!draw) {
      throw new Error(`Draw ${drawId} không tồn tại.`);
    }

    if (draw.status !== DrawStatus.Settling) {
      throw new Error(`Draw ${drawId} status = "${draw.status}", expected "settling".`);
    }

    if (!draw.result) {
      throw new Error(`Draw ${drawId} chưa có kết quả quay.`);
    }

    const [globalConfig, activeCycle] = await Promise.all([
      this.getGlobalConfig.run(),
      this.cycleRepo.getActiveCycle(),
    ]);

    const jackpotOpeningAmount = activeCycle?.currentAmount ?? globalConfig.jackpot.seedAmount;

    const isSplitCycle = draw.jackpot?.isSplitCycle ?? false;

    const prizeMap = buildPrizeAmountMap(globalConfig.defaultPrizes);
    const prizeAmounts: Record<string, number> = {};
    for (const [tier, amount] of prizeMap) {
      prizeAmounts[tier] = amount;
    }

    const [totalEntries, totalLines] = await Promise.all([
      this.entryRepo.countEntriesByDrawId(drawId),
      this.entryRepo.countLinesByDrawId(drawId),
    ]);

    return {
      drawId,
      drawDate: draw.drawDate,
      drawNo: draw.drawNo,
      financialDate: draw.financialDate,
      result: {
        winningMain: draw.result.winningMain as unknown as number[],
        winningSpecial: draw.result.winningSpecial,
      },
      jackpotOpeningAmount,
      isSplitCycle,
      prizeAmounts,
      config: {
        seedAmount: globalConfig.jackpot.seedAmount,
        splitThreshold: globalConfig.jackpot.splitThreshold,
        splitRatios: globalConfig.jackpot.splitRatios,
        companyRate: globalConfig.rates.companyRate,
        defaultCommissionRate: globalConfig.rates.defaultCommissionRate,
      },
      totalEntries,
      totalLines,
    };
  }
}

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

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";

export interface PrepareSettleInput {
  /** ID kỳ quay cần chuẩn bị settle. */
  drawId: string;
}

export interface PrepareSettleResult {
  /** ID kỳ quay đang được settle. */
  drawId: string;
  /** Ngày quay, định dạng YYYY-MM-DD. */
  drawDate: string;
  /** Số thứ tự kỳ quay trong năm. */
  drawNo: number;
  /** Ngày tài chính (thường trùng drawDate, dùng cho báo cáo). */
  financialDate: string;
  /** Kết quả quay số đã công bố. */
  result: {
    /** 6 số chính trúng thưởng (1-55). */
    winningMain: number[];
    /** Số bonus (1 số từ 49 số còn lại). */
    bonusNumber: number;
  };
  /** Số dư Jackpot 1 đầu kỳ (VND), đọc từ active cycle. */
  jp1OpeningAmount: number;
  /** Số dư Jackpot 2 đầu kỳ (VND), đọc từ active cycle. */
  jp2OpeningAmount: number;
  /** Có phải kỳ chia giải (tổng JP vượt splitThreshold) hay không. */
  isSplitCycle: boolean;
  /** Giá trị giải thưởng cố định theo tier (VND). Key: tier1/tier2/tier3. */
  prizeAmounts: Record<string, number>;
  /** Cấu hình tài chính + jackpot snapshot tại thời điểm settle. */
  config: {
    /** Giá trị khởi tạo JP1 khi bắt đầu cycle mới (VND). */
    jp1SeedAmount: number;
    /** Giá trị khởi tạo JP2 khi bắt đầu cycle mới (VND). */
    jp2SeedAmount: number;
    /** Tỷ lệ doanh thu đóng góp vào JP1 (0-1). */
    jp1Ratio: number;
    /** Tỷ lệ doanh thu đóng góp vào JP2 (0-1). */
    jp2Ratio: number;
    /** Ngưỡng tràn JP1 (VND). Phần vượt quá sẽ chuyển sang JP2. */
    jp1OverflowThreshold: number;
    /** Ngưỡng tổng JP (JP1 + JP2) để kích hoạt chia giải (VND). */
    splitThreshold: number;
    /** Tỷ lệ chia giải cho các tier khi split. */
    splitRatios: {
      /** Tỷ lệ chia cho tier1. */
      tier1: number;
      /** Tỷ lệ chia cho tier2. */
      tier2: number;
      /** Tỷ lệ chia cho tier3. */
      tier3: number;
    };
    /** Tỷ lệ phần trăm doanh thu cho công ty (0-1). */
    companyRate: number;
    /** Tỷ lệ hoa hồng đại lý mặc định (0-1). */
    defaultCommissionRate: number;
  };
  /** Tổng số entries cần settle (chỉ đếm entries chưa settled). */
  totalEntries: number;
  /** Tổng số dòng cược từ tất cả entries. */
  totalLines: number;
}

/**
 * Load context cho settle flow Power 6/55.
 * Loads dual jackpot (JP1 + JP2) opening amounts từ active cycle.
 */
export class PrepareSettleUseCase extends InternalUseCase<
  PrepareSettleInput,
  PrepareSettleResult
> {
  private readonly drawRepo = new DrawRepository();
  private readonly entryRepo = new EntryRepository();
  private readonly cycleRepo = new JackpotCycleRepository();
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();

  /** @inheritdoc */
  protected async execute(
    input: PrepareSettleInput
  ): Promise<PrepareSettleResult> {
    const { drawId } = input;

    const draw = await this.drawRepo.getDrawById(drawId);
    if (!draw) {
      throw new Error(`Draw ${drawId} không tồn tại.`);
    }

    if (draw.status !== DrawStatus.Settling) {
      throw new Error(
        `Draw ${drawId} status = "${draw.status}", expected "settling".`
      );
    }

    if (!draw.result) {
      throw new Error(`Draw ${drawId} chưa có kết quả quay.`);
    }

    const [globalConfig, activeCycle] = await Promise.all([
      this.getGlobalConfig.run(),
      this.cycleRepo.getActiveCycle(),
    ]);

    const jp1OpeningAmount =
      activeCycle?.jackpot1Current ?? globalConfig.jackpot.jackpot1.seedAmount;
    const jp2OpeningAmount =
      activeCycle?.jackpot2Current ?? globalConfig.jackpot.jackpot2.seedAmount;

    const isSplitCycle = draw.jackpot?.isSplitCycle ?? false;

    const prizeAmounts: Record<string, number> = {
      tier1: globalConfig.defaultPrizes.tier1,
      tier2: globalConfig.defaultPrizes.tier2,
      tier3: globalConfig.defaultPrizes.tier3,
    };

    const [totalEntries, totalLines] = await Promise.all([
      this.entryRepo.countEntriesByDrawId(drawId),
      this.entryRepo.countLinesByDrawId(drawId),
    ]);

    return {
      drawId,
      drawDate: draw.drawDate,
      drawNo: draw.drawNo,
      financialDate: (draw as any).financialDate ?? draw.drawDate,
      result: {
        winningMain: draw.result.winningMain as unknown as number[],
        bonusNumber: draw.result.bonusNumber,
      },
      jp1OpeningAmount,
      jp2OpeningAmount,
      isSplitCycle,
      prizeAmounts,
      config: {
        jp1SeedAmount: globalConfig.jackpot.jackpot1.seedAmount,
        jp2SeedAmount: globalConfig.jackpot.jackpot2.seedAmount,
        jp1Ratio: globalConfig.jackpot.jp1ContributionRatio,
        jp2Ratio: globalConfig.jackpot.jp2ContributionRatio,
        jp1OverflowThreshold: globalConfig.jackpot.jp1OverflowThreshold,
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

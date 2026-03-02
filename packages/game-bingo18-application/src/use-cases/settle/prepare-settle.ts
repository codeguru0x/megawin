/**
 * Use Case: Prepare Settle (Bingo 18)
 *
 * Load context cho settle flow. Chỉ ĐỌC, không ghi – idempotent.
 *
 * Bingo 18: KHÔNG có Jackpot, KHÔNG có payout caps.
 * Giải thưởng cố định theo bảng prize table.
 */

import { StepFunctionUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import type {
  SingleNumPrizes,
  DoubleMatchPrizes,
  TripleMatchPrizes,
  SumTotalPrizes,
  BigSmallDrawPrizes,
} from "@megawin/game-bingo18/entities";

export interface PrepareSettleInput {
  /** ID kỳ quay cần settle. */
  drawId: string;
}

export interface PrepareSettleResult {
  /** ID kỳ quay. */
  drawId: string;
  /** Ngày quay (YYYY-MM-DD). */
  drawDate: string;
  /** Số thứ tự kỳ trong ngày. */
  drawNo: number;
  /** Ngày tài chính (YYYY-MM-DD) dùng cho báo cáo. */
  financialDate: string;
  /** Kết quả quay đã publish. */
  result: {
    /** 3 số kết quả (1-6). */
    numbers: number[];
    /** Tổng 3 số = numbers[0] + numbers[1] + numbers[2]. */
    sum: number;
  };
  /** Cấu hình giải thưởng & tỷ lệ tài chính tại thời điểm settle. */
  config: {
    /** Tỷ lệ công ty (0-1). Dùng tính companyTake = totalRevenue × companyRate. */
    companyRate: number;
    /** Tỷ lệ hoa hồng mặc định cho tenant (0-1). */
    defaultCommissionRate: number;
    /** Bảng giải chơi Đơn (match 1/2/3 số). */
    singleNumPrizes: SingleNumPrizes;
    /** Bảng giải chơi Đúp (≥2 số trùng). */
    doubleMatchPrizes: DoubleMatchPrizes;
    /** Bảng giải chơi Ba (specific/any triple). */
    tripleMatchPrizes: TripleMatchPrizes;
    /** Bảng giải chơi Tổng (đoán đúng tổng 3 số). */
    sumTotalPrizes: SumTotalPrizes;
    /** Bảng giải Tài/Xỉu/Hoà. */
    bigSmallDrawPrizes: BigSmallDrawPrizes;
  };
  /** Tổng entries cần settle trong kỳ này. */
  totalEntries: number;
}

export class PrepareSettleUseCase extends StepFunctionUseCase<
  PrepareSettleInput,
  PrepareSettleResult
> {
  private readonly drawRepo = new DrawRepository();
  private readonly entryRepo = new EntryRepository();
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();

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

    const globalConfig = await this.getGlobalConfig.run();

    const totalEntries = await this.entryRepo.countEntriesByDrawId(drawId);

    return {
      drawId,
      drawDate: draw.drawDate,
      drawNo: draw.drawNo,
      financialDate: draw.financialDate,
      result: {
        numbers: draw.result.numbers,
        sum: draw.result.sum,
      },
      config: {
        companyRate: globalConfig.rates.companyRate,
        defaultCommissionRate: globalConfig.rates.defaultCommissionRate,
        singleNumPrizes: globalConfig.singleNumPrizes,
        doubleMatchPrizes: globalConfig.doubleMatchPrizes,
        tripleMatchPrizes: globalConfig.tripleMatchPrizes,
        sumTotalPrizes: globalConfig.sumTotalPrizes,
        bigSmallDrawPrizes: globalConfig.bigSmallDrawPrizes,
      },
      totalEntries,
    };
  }
}

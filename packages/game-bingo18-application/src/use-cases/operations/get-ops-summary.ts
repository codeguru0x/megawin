import { NextApiUseCase } from "@megawin/next/server";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { getFinancialDateToday } from "./helpers";
import type { OpsQueryInput, OpsSummaryOutput } from "./dto/operations.dto";

/**
 * KPI tổng hợp cho dashboard vận hành Bingo 18.
 *
 * Bingo 18: profit = revenue - prizes - commission (KHÔNG có Jackpot).
 * Aggregate theo financialDate (ngày tài chính) hoặc drawId cụ thể.
 * totalBoards đếm tất cả boards (cả cơ bản và bổ sung).
 * CRASH-SAFE: idempotent, gọi lại nhiều lần trả kết quả giống nhau.
 */
export class GetOpsSummaryUseCase extends NextApiUseCase<OpsQueryInput, OpsSummaryOutput> {
  private readonly entryRepo = new EntryRepository();

  protected async execute(input: OpsQueryInput): Promise<OpsSummaryOutput> {
    const financialDate = input.financialDate ?? getFinancialDateToday();
    const summary = await this.entryRepo.aggregateOpsSummary({
      financialDate,
      drawId: input.drawId,
    });

    return {
      financialDate,
      totalRevenue: summary.totalRevenue,
      totalEntries: summary.totalEntries,
      totalBoards: summary.totalBoards,
      totalPlayers: summary.uniquePlayers,
      totalCommission: summary.totalCommission,
    };
  }
}

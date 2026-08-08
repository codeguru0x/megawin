import { NextApiUseCase } from "@megawin/next/server";

import { SystemSettleGameDailyRepository } from "../../infras/repos/system-settle-game-daily-repo";
import type { GetGameSummaryInput, GetGameSummaryOutput } from "./types";

/**
 * Tổng hợp tài chính hệ thống theo từng game trong date range.
 *
 * Kết quả dùng cho tab "Theo game" trang System Financial Reports.
 * Mỗi row = 1 game, đã tổng hợp toàn bộ draws trong range.
 */
export class GetGameSummaryUseCase extends NextApiUseCase<GetGameSummaryInput, GetGameSummaryOutput> {
  private readonly repo = new SystemSettleGameDailyRepository();

  protected async execute(input: GetGameSummaryInput): Promise<GetGameSummaryOutput> {
    const data = await this.repo.aggregateByGameProduct(input.from, input.to);
    return { data };
  }
}

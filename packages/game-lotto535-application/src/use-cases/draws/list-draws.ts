import { NextApiUseCase } from "@megawin/next/server";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { ListDrawsInput, ListDrawsOutput, DrawSummary } from "./dto/draw.dto";

/**
 * Danh sách kỳ quay cho backoffice.
 * Hỗ trợ filter theo status, date range, pagination.
 */
export class ListDrawsUseCase extends NextApiUseCase<
  ListDrawsInput,
  ListDrawsOutput
> {
  protected async execute(input: ListDrawsInput): Promise<ListDrawsOutput> {
    const page = input.page ?? 1;
    const size = input.size ?? 20;

    const drawRepo = new DrawRepository();

    const draws = await drawRepo.listDraws(
      {
        status: input.status,
        fromDate: input.fromDate,
        toDate: input.toDate,
      },
      page,
      size,
    );

    const summaries: DrawSummary[] = draws.map((d) => ({
      id: d.id,
      drawId: d.drawId,
      drawDate: d.drawDate,
      drawNo: d.drawNo,
      drawTime: d.drawTime.toISOString(),
      status: d.status,
      jackpotAmount: d.jackpot.openingAmount,
      isSplitCycle: d.jackpot.isSplitCycle ?? false,
      hasResult: !!d.result,
      ticketEntryCount: d.stats?.ticketEntryCount,
      totalRevenue: d.stats?.totalSalesAmount,
    }));

    return { draws: summaries, page, size };
  }
}

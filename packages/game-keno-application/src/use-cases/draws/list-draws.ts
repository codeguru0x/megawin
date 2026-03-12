import { NextApiUseCase } from "@megawin/next/server";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { ListDrawsInput, ListDrawsOutput, DrawSummary } from "./dto/draw.dto";

export class ListDrawsUseCase extends NextApiUseCase<ListDrawsInput, ListDrawsOutput> {
  private readonly drawRepo = new DrawRepository();

  protected async execute(input: ListDrawsInput): Promise<ListDrawsOutput> {
    const page = input.page ?? 1;
    const size = input.size ?? 20;
    const draws = await this.drawRepo.listDraws(
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
      hasResult: !!d.result,
      // Truyền winningNumbers sang UI để hiển thị số trúng trên draw history card
      result: d.result?.winningNumbers ? { winningNumbers: d.result.winningNumbers } : undefined,
      ticketEntryCount: d.stats?.ticketEntryCount,
      totalRevenue: d.stats?.totalSalesAmount,
    }));

    return { draws: summaries, page, size };
  }
}

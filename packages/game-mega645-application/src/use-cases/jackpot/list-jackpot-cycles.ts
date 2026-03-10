import { NextApiUseCase } from "@megawin/next/server";
import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import type {
  ListJackpotCyclesInput,
  ListJackpotCyclesOutput,
  JackpotCycleSummary,
} from "./dto/jackpot.dto";

export class ListJackpotCyclesUseCase extends NextApiUseCase<
  ListJackpotCyclesInput,
  ListJackpotCyclesOutput
> {
  private readonly cycleRepo = new JackpotCycleRepository();

  protected async execute(input: ListJackpotCyclesInput): Promise<ListJackpotCyclesOutput> {
    const page = input.page ?? 1;
    const size = input.size ?? 10;

    const [cycles, total] = await Promise.all([
      this.cycleRepo.listClosedCycles(page, size),
      this.cycleRepo.countClosedCycles(),
    ]);

    const summaries: JackpotCycleSummary[] = cycles.map((c) => ({
      id: c.id,
      cycleNo: c.cycleNo,
      status: c.status,
      startDrawId: c.startDrawId,
      startedAt: c.startedAt.toISOString(),
      endDrawId: c.endDrawId,
      closedAt: c.closedAt?.toISOString(),
      closeReason: c.closeReason,
      seedAmount: c.seedAmount,
      currentAmount: c.currentAmount,
      peakAmount: c.peakAmount,
      totalContribution: c.totalContribution,
      drawCount: c.drawCount,
      winners: c.winners?.map((w) => ({
        accountId: w.accountId,
        username: w.username,
        tenantId: w.tenantId,
        prizeAmount: w.prizeAmount,
        entryId: w.entryId,
        drawId: w.drawId,
      })),
    }));

    return { cycles: summaries, page, size, total };
  }
}

/**
 * Use Case: List Jackpot Cycles (Power 6/55)
 *
 * Lấy lịch sử các lần chia giải / trúng Jackpot.
 * Mỗi cycle = 1 vòng đời từ seed → winner/split.
 * Hỗ trợ dual jackpot: JP1 + JP2.
 */

import { UseCase } from "@megawin/app-core/use-cases";

import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import type { JackpotCycleSummary, ListJackpotCyclesInput, ListJackpotCyclesOutput } from "./dto/jackpot.dto";

/**
 * Lấy danh sách các cycle jackpot đã đóng.
 * Mỗi cycle chứa thông tin dual JP (JP1 seedAmount/current, JP2 seedAmount/current).
 */
export class ListJackpotCyclesUseCase extends UseCase<ListJackpotCyclesInput, ListJackpotCyclesOutput> {
  private readonly cycleRepo = new JackpotCycleRepository();

  /** @inheritdoc */
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
      startedAt: c.createdAt.toISOString(),
      endDrawId: c.endDrawId,
      closedAt: c.closedAt?.toISOString(),
      closedReason: c.closedReason,
      jackpot1SeedAmount: c.jackpot1SeedAmount,
      jackpot1CurrentAmount: c.jackpot1CurrentAmount,
      jackpot2SeedAmount: c.jackpot2SeedAmount,
      jackpot2CurrentAmount: c.jackpot2CurrentAmount,
      drawCount: c.drawCount,
      winners: (c as any).winners?.map((w: any) => ({
        accountId: w.accountId,
        username: w.username,
        tenantId: w.tenantId,
        prizeAmount: w.prizeAmount,
        entryId: w.entryId,
        drawId: w.drawId,
        jackpotType: w.jackpotType ?? "jackpot1",
      })),
    }));

    return { cycles: summaries, page, size, total };
  }
}

/**
 * Use Case: Sync Ticket Summaries (Max 3D)
 *
 * Recompute ticket progress/settlement/voidSummary từ entries.
 * Idempotent, self-healing — chạy lại bao nhiêu lần cũng cho cùng kết quả.
 *
 * Input:  { drawId }
 * Output: { ticketsSynced }
 *
 * Logic:
 *   1. distinct ticketIds từ entries của draw
 *   2. For each ticket: aggregate tất cả entries → compute summary
 *   3. $set toàn bộ (không $inc) → idempotent
 */

import { StepFunctionUseCase } from "@megawin/app-core/use-cases";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { TicketRepository } from "../../infras/repos/ticket-repo";

export interface SyncTicketSummariesInput {
  /** ID kỳ quay cần sync. */
  drawId: string;
}

export interface SyncTicketSummariesResult {
  /** ID kỳ quay. */
  drawId: string;
  /** Số tickets đã sync lại summary. */
  ticketsSynced: number;
}

export class SyncTicketSummariesUseCase extends StepFunctionUseCase<
  SyncTicketSummariesInput,
  SyncTicketSummariesResult
> {
  private readonly entryRepo = new EntryRepository();
  private readonly ticketRepo = new TicketRepository();

  protected async execute(
    input: SyncTicketSummariesInput
  ): Promise<SyncTicketSummariesResult> {
    const { drawId } = input;

    const ticketIds = await this.entryRepo.getDistinctTicketIdsByDrawId(drawId);
    let ticketsSynced = 0;

    for (const ticketId of ticketIds) {
      const ticket = await this.ticketRepo.getTicketById(ticketId.toString());
      if (!ticket) continue;

      const totalDraws =
        (ticket as any).progress?.totalDraws ??
        (ticket as any).drawPlan?.drawCount ??
        1;

      const summary = await this.entryRepo.aggregateTicketSummary(ticketId);

      await this.ticketRepo.syncSummary(ticketId, {
        ...summary,
        totalDraws,
      });

      ticketsSynced++;
    }

    return { drawId, ticketsSynced };
  }
}

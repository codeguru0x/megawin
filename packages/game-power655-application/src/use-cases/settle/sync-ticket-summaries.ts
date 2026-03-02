/**
 * Use Case: Sync Ticket Summaries (Power 6/55)
 *
 * Recompute ticket progress/settlement/voidSummary từ entries.
 * Idempotent, self-healing — chạy lại bao nhiêu lần cũng cho cùng kết quả.
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
  /** ID kỳ quay cần sync ticket summaries. */
  drawId: string;
}

export interface SyncTicketSummariesResult {
  /** ID kỳ quay đã sync. */
  drawId: string;
  /** Số ticket đã được recompute và sync summary. */
  ticketsSynced: number;
}

/**
 * Sync ticket summaries từ entries Power 6/55.
 * Idempotent: aggregate từ DB, ghi đè summary.
 */
export class SyncTicketSummariesUseCase extends StepFunctionUseCase<
  SyncTicketSummariesInput,
  SyncTicketSummariesResult
> {
  private readonly entryRepo = new EntryRepository();
  private readonly ticketRepo = new TicketRepository();

  /** @inheritdoc */
  protected async execute(
    input: SyncTicketSummariesInput
  ): Promise<SyncTicketSummariesResult> {
    const { drawId } = input;

    const ticketIds =
      await this.entryRepo.getDistinctTicketIdsByDrawId(drawId);
    let ticketsSynced = 0;

    for (const ticketId of ticketIds) {
      const ticket = await this.ticketRepo.getTicketById(ticketId.toString());
      if (!ticket) continue;

      const totalDraws = ticket.drawPlan?.drawCount ?? 1;
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

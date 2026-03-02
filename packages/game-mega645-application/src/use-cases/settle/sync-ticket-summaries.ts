/**
 * Use Case: Sync Ticket Summaries (Mega 6/45)
 *
 * Recompute ticket progress/settlement/voidSummary từ entries.
 * Idempotent, self-healing.
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
  /** Số ticket đã được cập nhật progress/settlement từ entries. */
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

/**
 * Use Case: Sync Ticket Summaries (Max 3D Pro)
 *
 * Recompute ticket progress/settlement/voidSummary từ entries.
 * Idempotent, self-healing — chạy lại bao nhiêu lần cũng cho cùng kết quả.
 *
 * Flow (chunk-based):
 *   1. Cursor qua tickets có drawPlan.drawIds chứa drawId (batch 500)
 *   2. Batch aggregate entries summary
 *   3. BulkWrite sync summaries (conditional processedCount)
 *
 * DB calls per chunk: 2 (aggregate + bulkWrite).
 * Race-safe: conditional processedCount filter.
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { TicketRepository } from "../../infras/repos/ticket-repo";
import { ObjectId } from "mongodb";

const CHUNK_SIZE = 500;

export interface SyncTicketSummariesInput {
  drawId: string;
}

export interface SyncTicketSummariesResult {
  drawId: string;
  ticketsSynced: number;
}

export class SyncTicketSummariesUseCase extends InternalUseCase<
  SyncTicketSummariesInput,
  SyncTicketSummariesResult
> {
  private readonly entryRepo = new EntryRepository();
  private readonly ticketRepo = new TicketRepository();

  protected async execute(
    input: SyncTicketSummariesInput,
  ): Promise<SyncTicketSummariesResult> {
    const { drawId } = input;
    let ticketsSynced = 0;
    let cursor: string | undefined;

    while (true) {
      const chunk = await this.ticketRepo.getTicketsByDrawIdCursor(drawId, cursor, CHUNK_SIZE);
      if (chunk.length === 0) break;

      const ticketIds = chunk.map((t) => new ObjectId(t.ticketId));
      const totalDrawsMap = new Map(chunk.map((t) => [t.ticketId, t.totalDraws]));
      const summaryMap = await this.entryRepo.aggregateTicketSummariesBatch(ticketIds);

      const items = chunk
        .map((t) => {
          const summary = summaryMap.get(t.ticketId);
          if (!summary) return null;
          return {
            ticketId: t.ticketId,
            summary: { ...summary, totalDraws: totalDrawsMap.get(t.ticketId) ?? 1 },
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      if (items.length > 0) {
        await this.ticketRepo.bulkSyncSummaries(items);
      }

      ticketsSynced += items.length;
      cursor = chunk[chunk.length - 1]!.ticketId;
      if (chunk.length < CHUNK_SIZE) break;
    }

    return { drawId, ticketsSynced };
  }
}

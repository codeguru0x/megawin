/**
 * Use Case: Sync Ticket Summaries (Max 3D Pro)
 *
 * Recompute ticket progress/settlement/voidSummary từ entries.
 * Idempotent, self-healing — chạy lại bao nhiêu lần cũng cho cùng kết quả.
 *
 * Flow (chunk-based, time-bounded):
 *   1. Cursor qua tickets có drawPlan.drawIds chứa drawId (batch 500)
 *   2. Batch aggregate entries summary
 *   3. BulkWrite sync summaries (conditional processedCount)
 *   4. Loop until done or MAX_EXECUTION_MS exceeded
 *
 * DB calls per chunk: 2 (aggregate + bulkWrite).
 * Race-safe: conditional processedCount filter.
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { TicketRepository } from "../../infras/repos/ticket-repo";
import { ObjectId } from "mongodb";

const CHUNK_SIZE = 500;
const MAX_EXECUTION_MS = 10 * 60 * 1000;

export interface SyncTicketSummariesResult {
  drawId: string;
  done: boolean;
}

/** Minimal input — chỉ cần drawId, compatible với SettleContext và VoidContext. */
export interface DrawSyncInput {
  drawId: string;
}

export class SyncTicketSummariesUseCase extends InternalUseCase<
  DrawSyncInput,
  SyncTicketSummariesResult
> {
  private readonly entryRepo = new EntryRepository();
  private readonly ticketRepo = new TicketRepository();

  protected async execute(input: DrawSyncInput): Promise<SyncTicketSummariesResult> {
    const { drawId } = input;
    let cursor: string | undefined;
    const startTime = Date.now();

    while (Date.now() - startTime < MAX_EXECUTION_MS) {
      const chunk = await this.ticketRepo.getTicketsByDrawIdCursor(drawId, cursor, CHUNK_SIZE);
      if (chunk.length === 0) return { drawId, done: true };

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

      cursor = chunk[chunk.length - 1]!.ticketId;
      if (chunk.length < CHUNK_SIZE) return { drawId, done: true };
    }

    return { drawId, done: false };
  }
}

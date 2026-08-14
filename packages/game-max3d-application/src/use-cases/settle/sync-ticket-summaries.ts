/**
 * Use Case: Sync Ticket Summaries (Max 3D)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * STEP 3 TRONG SETTLE FLOW (LOOP — gọi nhiều lần cho đến done=true)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Recompute ticket progress/settlement/voidSummary từ entries.
 * Idempotent, self-healing — chạy lại bao nhiêu lần cũng cho cùng kết quả.
 *
 * Flow (chunk-based, time-bounded):
 *   1. Cursor qua tickets có drawPlan.drawIds chứa drawId (batch 500)
 *   2. Batch aggregate entries summary
 *   3. BulkWrite sync summaries (conditional processedCount)
 *
 * DB calls per chunk: 2 (aggregate + bulkWrite).
 * Race-safe: conditional processedCount filter.
 */

import { UseCase } from "@megawin/app-core/use-cases";
import { ObjectId } from "mongodb";

import { EntryRepository } from "../../infras/repos/entry-repo";
import { TicketRepository } from "../../infras/repos/ticket-repo";

const BATCH_SIZE = 500;
const MAX_EXECUTION_MS = 10 * 60 * 1000;

export interface SyncTicketSummariesResult {
  drawId: string;
  done: boolean;
}

/** Minimal input — chỉ cần drawId, compatible với SettleContext và VoidContext. */
export interface DrawSyncInput {
  drawId: string;
}

export class SyncTicketSummariesUseCase extends UseCase<DrawSyncInput, SyncTicketSummariesResult> {
  private readonly entryRepo = new EntryRepository();
  private readonly ticketRepo = new TicketRepository();

  protected async execute(input: DrawSyncInput): Promise<SyncTicketSummariesResult> {
    const { drawId } = input;
    let cursor: string | undefined;
    const startTime = Date.now();

    while (Date.now() - startTime < MAX_EXECUTION_MS) {
      const tickets = await this.ticketRepo.getTicketsByDrawIdCursor(drawId, cursor, BATCH_SIZE);

      if (tickets.length === 0) {
        return { drawId, done: true };
      }

      const ticketIds = tickets.map((t) => new ObjectId(t.ticketId));
      const totalDrawsMap = new Map(tickets.map((t) => [t.ticketId, t.totalDraws]));
      const summaryMap = await this.entryRepo.aggregateTicketSummariesBatch(ticketIds);

      const items = tickets
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

      cursor = tickets[tickets.length - 1]!.ticketId;

      if (tickets.length < BATCH_SIZE) {
        return { drawId, done: true };
      }
    }

    return { drawId, done: false };
  }
}

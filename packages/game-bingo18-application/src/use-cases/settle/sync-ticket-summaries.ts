/**
 * Use Case: Sync Ticket Summaries (Bingo 18)
 *
 * Recompute ticket progress/settlement/voidSummary từ entries.
 * Idempotent, self-healing — chạy lại bao nhiêu lần cũng cho cùng kết quả.
 *
 * Input:  { drawId }
 * Output: { drawId, done }
 *
 * Flow (chunk-based, tối ưu DB calls):
 *   1. Cursor qua tickets có drawPlan.drawIds chứa drawId (batch 500)
 *   2. Batch aggregate entries summary cho 500 ticketIds cùng lúc
 *   3. BulkWrite sync summaries (conditional: chỉ ghi nếu processedCount mới >= cũ)
 *   4. Lặp cho đến hết tickets hoặc hết thời gian
 *
 * DB calls per chunk: 2 (aggregate + bulkWrite) thay vì 3N trước đây.
 * Race-safe: conditional processedCount filter tránh ghi đè khi nhiều draw settle đồng thời.
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { TicketRepository } from "../../infras/repos/ticket-repo";
import { ObjectId } from "mongodb";

const CHUNK_SIZE = 500;
const MAX_EXECUTION_MS = 10 * 60 * 1000;

export interface SyncTicketSummariesInput {
  drawId: string;
}

export interface SyncTicketSummariesResult {
  drawId: string;
  done: boolean;
}

export class SyncTicketSummariesUseCase extends InternalUseCase<
  SyncTicketSummariesInput,
  SyncTicketSummariesResult
> {
  private readonly entryRepo = new EntryRepository();
  private readonly ticketRepo = new TicketRepository();

  protected async execute(input: SyncTicketSummariesInput): Promise<SyncTicketSummariesResult> {
    const { drawId } = input;
    let cursor: string | undefined;
    const startTime = Date.now();

    while (Date.now() - startTime < MAX_EXECUTION_MS) {
      const chunk = await this.ticketRepo.getTicketsByDrawIdCursor(drawId, cursor, CHUNK_SIZE);

      if (chunk.length === 0) {
        return { drawId, done: true };
      }

      const ticketIds = chunk.map((t) => t.ticketId);
      const totalDrawsMap = new Map(chunk.map((t) => [t.ticketId, t.totalDraws]));

      const summaryMap = await this.entryRepo.aggregateTicketSummariesBatch(
        ticketIds.map((t) => new ObjectId(t)),
      );

      const items = chunk
        .map((t) => {
          const summary = summaryMap.get(t.ticketId);

          if (!summary) {
            return null;
          }

          return {
            ticketId: t.ticketId,
            summary: { ...summary, totalDraws: totalDrawsMap.get(t.ticketId) ?? 1 },
          };
        })
        .filter((item) => item !== null);

      if (items.length > 0) {
        await this.ticketRepo.bulkSyncSummaries(items);
      }

      cursor = ticketIds[ticketIds.length - 1];

      if (chunk.length < CHUNK_SIZE) {
        return { drawId, done: true };
      }
    }

    return { drawId, done: false };
  }
}

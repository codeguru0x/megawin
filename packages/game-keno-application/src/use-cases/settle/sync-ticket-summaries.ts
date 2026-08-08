/**
 * Use Case: Sync Ticket Summaries (Keno)
 *
 * Recompute ticket progress/settlement/voidSummary từ entries.
 * Idempotent, self-healing — chạy lại bao nhiêu lần cũng cho cùng kết quả.
 *
 * Input:  SettleContext (chỉ cần drawId)
 * Output: { drawId, done }
 *
 * Flow (chunk-based, tối ưu DB calls):
 *   1. Cursor qua tickets có drawPlan.drawIds chứa drawId (batch 500)
 *   2. Batch aggregate entries summary cho 500 ticketIds cùng lúc
 *   3. BulkWrite sync summaries (conditional: chỉ ghi nếu processedCount mới >= cũ)
 *   4. Lặp cho đến hết tickets hoặc hết thời gian MAX_EXECUTION_MS
 *
 * DB calls per chunk: 2 (aggregate + bulkWrite) thay vì 3N trước đây.
 * Race-safe: conditional processedCount filter tránh ghi đè khi nhiều draw settle đồng thời.
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { TicketRepository } from "../../infras/repos/ticket-repo";
import type { SettleContext } from "./types";

const BATCH_SIZE = 500;
const MAX_EXECUTION_MS = 10 * 60 * 1000;

export interface SyncTicketSummariesResult {
  drawId: string;
  done: boolean;
}

export class SyncTicketSummariesUseCase extends InternalUseCase<SettleContext, SyncTicketSummariesResult> {
  private readonly entryRepo = new EntryRepository();
  private readonly ticketRepo = new TicketRepository();

  protected async execute(input: SettleContext): Promise<SyncTicketSummariesResult> {
    const { drawId } = input;
    const startTime = Date.now();
    let cursor: string | undefined;

    while (Date.now() - startTime < MAX_EXECUTION_MS) {
      const tickets = await this.ticketRepo.getTicketsByDrawId(drawId, cursor, BATCH_SIZE);

      if (tickets.length === 0) {
        return { drawId, done: true };
      }

      const ticketIds = tickets.map((t) => t.ticketId);
      const totalDrawsMap = new Map(tickets.map((t) => [t.ticketId, t.totalDraws]));

      const summaryMap = await this.entryRepo.aggregateTicketSummariesBatch(ticketIds);

      const items = tickets
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
    }

    return { drawId, done: false };
  }
}

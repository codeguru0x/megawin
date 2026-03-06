/**
 * Use Case: Sync Ticket Summaries (Lotto 5/35)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * STEP 5 TRONG SETTLE FLOW (LOOP — gọi nhiều lần cho đến done=true)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Recompute ticket progress/settlement/voidSummary từ entries đã settle.
 * Idempotent, self-healing — chạy lại bao nhiêu lần cũng cho cùng kết quả.
 *
 * ────────────────────────────────────────────────
 * TẠI SAO CẦN STEP NÀY:
 * ────────────────────────────────────────────────
 *   - settle-entries chỉ update từng entry, KHÔNG update ticket
 *   - Ticket cần biết tổng quan: đã settle bao nhiêu kỳ, tổng thắng,
 *     trạng thái hiện tại (active/completed)
 *   - Step này recompute từ entries → ticket summary (single source of truth)
 *
 * ────────────────────────────────────────────────
 * FLOW (chunk-based, tối ưu DB calls):
 * ────────────────────────────────────────────────
 *   1. Cursor qua tickets có drawPlan.drawIds chứa drawId (batch 500)
 *      → Tìm tất cả tickets tham gia kỳ quay này
 *
 *   2. Batch aggregate entries summary cho 500 ticketIds cùng lúc
 *      → Tính: processedCount, settledCount, wonCount, totalWin, totalPayout...
 *      → Chỉ 1 DB call cho cả batch (thay vì N calls)
 *
 *   3. BulkWrite sync summaries lên tickets
 *      → Conditional: chỉ ghi nếu processedCount mới >= cũ
 *      → Tránh ghi đè khi nhiều draw settle đồng thời (race-safe)
 *
 *   4. Lặp cho đến hết tickets hoặc hết thời gian Lambda (10 phút)
 *
 * DB calls per chunk: 2 (aggregate + bulkWrite) thay vì 3N trước đây.
 *
 * ────────────────────────────────────────────────
 * RACE-SAFE:
 * ────────────────────────────────────────────────
 *   Conditional processedCount filter: nếu ticket đã có processedCount
 *   cao hơn (do draw khác settle xong trước) → skip, không ghi đè summary cũ.
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { TicketRepository } from "../../infras/repos/ticket-repo";
import { ObjectId } from "mongodb";

/** Số tickets xử lý mỗi chunk. */
const CHUNK_SIZE = 500;
/** Giới hạn thời gian chạy trong 1 Lambda invocation (10 phút). */
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
    const startTime = Date.now();
    // Cursor-based pagination: dùng ticketId cuối cùng làm cursor cho batch tiếp
    let cursor: string | undefined;

    // ── MAIN LOOP: xử lý chunk-by-chunk cho đến hết hoặc timeout ──
    while (Date.now() - startTime < MAX_EXECUTION_MS) {
      // Lấy chunk tickets tham gia kỳ quay drawId (dùng cursor pagination)
      // Tickets được tìm qua drawPlan.drawIds chứa drawId
      const chunk = await this.ticketRepo.getTicketsByDrawIdCursor(drawId, cursor, CHUNK_SIZE);

      // Không còn tickets → sync hoàn tất
      if (chunk.length === 0) {
        return { drawId, done: true };
      }

      const ticketIds = chunk.map((t) => new ObjectId(t.ticketId));
      // Cache totalDraws: ticket multi-draw có thể tham gia nhiều kỳ
      const totalDrawsMap = new Map(chunk.map((t) => [t.ticketId, t.totalDraws]));

      // Batch aggregate entries summary cho tất cả ticketIds trong chunk
      // → Tính: processedCount, settledCount, wonCount, totalWin, totalPayout...
      // → 1 DB aggregation pipeline call cho cả 500 tickets
      const summaryMap = await this.entryRepo.aggregateTicketSummariesBatch(ticketIds);

      // Build items để bulk sync (bỏ qua tickets không có summary — entry chưa settle)
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
        .filter((item): item is NonNullable<typeof item> => item !== null);

      // Bulk update ticket summaries (conditional: processedCount guard)
      if (items.length > 0) {
        await this.ticketRepo.bulkSyncSummaries(items);
      }

      // Di chuyển cursor sang ticket cuối cùng trong chunk
      cursor = chunk[chunk.length - 1]!.ticketId;

      // Chunk không đầy → đã xử lý hết tickets, hoàn tất
      if (chunk.length < CHUNK_SIZE) {
        return { drawId, done: true };
      }
    }

    // Lambda sắp timeout → trả done=false, Step Function sẽ gọi lại
    return { drawId, done: false };
  }
}

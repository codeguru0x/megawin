/**
 * Use Case: Void Entries Batch (Lotto 5/35)
 *
 * Step 2 (loop) của Void Draw Step Function.
 * Xử lý 1 batch entries: void entry + tính refund + update ticket.
 *
 * CRASH-SAFE:
 *   - Luôn query entries có status voidable (scheduled/active/drawn)
 *   - voidEntry() atomic: chỉ update nếu status đúng
 *   - done = true khi không còn entries voidable
 *
 * Logic refund:
 *   - Mỗi entry: refundAmount = originalAmount (entry.amount)
 *   - Multi-draw ticket: 1 kỳ void → partial refund (voidSummary trên ticket)
 *   - Single-draw ticket: kỳ duy nhất void → full refund, ticket status = refunded
 */

import { StepFunctionUseCase } from "@megawin/app-core/use-cases";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { TicketRepository } from "../../infras/repos/ticket-repo";

export interface VoidEntriesBatchInput {
  drawId: string;
  reason: string;
  voidedBy?: string;
  batchSize?: number;
}

export interface VoidEntriesBatchResult {
  drawId: string;
  done: boolean;
  batchVoided: number;
  batchSkipped: number;
  totalRefundAmount: number;
}

const DEFAULT_BATCH_SIZE = 100;

export class VoidEntriesBatchUseCase extends StepFunctionUseCase<
  VoidEntriesBatchInput,
  VoidEntriesBatchResult
> {
  private readonly entryRepo = new EntryRepository();
  private readonly ticketRepo = new TicketRepository();

  /** Void 1 batch entries. Loop cho đến khi done = true. */
  protected async execute(input: VoidEntriesBatchInput): Promise<VoidEntriesBatchResult> {
  const { drawId, reason, voidedBy, batchSize = DEFAULT_BATCH_SIZE } = input;
  const entries = await this.entryRepo.getVoidableEntriesBatch(drawId, batchSize);

  if (entries.length === 0) {
    return {
      drawId,
      done: true,
      batchVoided: 0,
      batchSkipped: 0,
      totalRefundAmount: 0,
    };
  }

  let batchVoided = 0;
  let batchSkipped = 0;
  let totalRefundAmount = 0;

  for (const entry of entries) {
    const entryId = (entry as any)._id?.toString?.() ?? (entry as any).id;
    const originalAmount = (entry as any).amount ?? 0;
    const refundAmount = originalAmount;

    const voided = await this.entryRepo.voidEntry(entryId, {
      reason,
      originalAmount,
      refundAmount,
      voidedBy,
    });

    if (!voided) {
      batchSkipped++;
      continue;
    }

    batchVoided++;
    totalRefundAmount += refundAmount;

    const ticketId = (entry as any).ticketId;
    if (!ticketId) continue;

    const ticket = await this.ticketRepo.getTicketById(ticketId);
    if (!ticket) continue;

    const totalDraws = (ticket as any).drawPlan?.totalDraws ?? 1;
    const isSingleDraw = totalDraws === 1;

    const settledDraws = (ticket as any).progress?.settledDraws ?? 0;
    const pendingAfterVoid = (ticket as any).progress?.pendingDraws - 1;
    const voidedBefore = (ticket as any).voidSummary?.voidedDrawCount ?? 0;
    const isAllDrawsProcessed =
      settledDraws + voidedBefore + 1 >= totalDraws;

    await this.ticketRepo.updateVoidProgress(
      ticketId,
      drawId,
      originalAmount,
      refundAmount,
      isSingleDraw,
      isAllDrawsProcessed,
    );
  }

  return {
    drawId,
    done: false,
    batchVoided,
    batchSkipped,
    totalRefundAmount,
  };
  }
}

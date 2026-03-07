/**
 * Use Case: Void Entries Batch (Lotto 5/35)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * STEP 2 TRONG VOID FLOW (LOOP — gọi nhiều lần cho đến done=true)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Batch void entries đang ở status "scheduled" cho kỳ bị huỷ.
 * Xử lý nhiều batch trong 1 lần gọi Lambda, dừng sớm khi sắp hết thời gian.
 *
 * ────────────────────────────────────────────────
 * LOGIC VOID ENTRY:
 * ────────────────────────────────────────────────
 *   1. Query batch entries có status = "scheduled" thuộc drawId (batch 500)
 *   2. Với mỗi entry: tính refundAmount = entry.amount (hoàn toàn bộ tiền cược)
 *   3. bulkVoidEntries:
 *      - Chuyển entry status: scheduled → voided
 *      - Ghi voidInfo: { refundAmount, refundStatus: "pending", voidedAt }
 *      - Atomic guard: chỉ update nếu status = "scheduled"
 *   4. Lặp cho đến khi hết entries hoặc timeout
 *
 * ────────────────────────────────────────────────
 * REFUND LOGIC:
 * ────────────────────────────────────────────────
 *   - Mỗi entry void → refundAmount = entry.amount (số tiền vé)
 *   - refundStatus = "pending" → sẽ được DispatchRefunds gửi hoàn cho tenant
 *   - Multi-draw ticket: chỉ void entry thuộc kỳ bị huỷ
 *     (ticket vẫn active cho các kỳ khác)
 *   - Single-draw ticket: void entry duy nhất → ticket sẽ bị đánh dấu refunded
 *     (SyncTicketSummaries xử lý)
 *
 * ────────────────────────────────────────────────
 * CRASH-SAFE:
 * ────────────────────────────────────────────────
 *   - Query chỉ entries status = "scheduled" → đã void thì tự skip
 *   - bulkWrite atomic per entry: guard status = "scheduled"
 *   - done = true khi không còn entries voidable trong kỳ
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { EntryRepository } from "../../infras/repos/entry-repo";
import type { VoidContext } from "./types";
import { RefundStatus } from "@megawin/game-lotto535/entities";

export interface VoidEntriesBatchResult {
  drawId: string;
  done: boolean;
}

/** Số entries xử lý mỗi batch DB query. */
const BATCH_SIZE = 500;
/** Giới hạn thời gian chạy trong 1 Lambda invocation (10 phút). */
const MAX_EXECUTION_MS = 10 * 60 * 1000;

export class VoidEntriesBatchUseCase extends InternalUseCase<VoidContext, VoidEntriesBatchResult> {
  private readonly entryRepo = new EntryRepository();

  protected async execute(input: VoidContext): Promise<VoidEntriesBatchResult> {
    const { drawId } = input;
    const startTime = Date.now();

    // ── MAIN LOOP: void batch-by-batch cho đến khi hết hoặc timeout ──
    while (Date.now() - startTime < MAX_EXECUTION_MS) {
      // Lấy batch entries có status = "scheduled" (chưa void, chưa settle)
      // Entries đã void sẽ không xuất hiện ở đây → retry safe
      const entries = await this.entryRepo.getVoidableEntriesBatch(drawId, BATCH_SIZE);

      // Không còn entries voidable → hoàn tất
      if (entries.length === 0) {
        return { drawId, done: true };
      }

      // Chuẩn bị bulk void items: mỗi entry = { entryId, voidInfo }
      // refundAmount = entry.amount: hoàn toàn bộ tiền cược cho entry bị void
      const now = new Date();
      const items = entries.map((entry) => ({
        entryId: entry.id,
        voidInfo: {
          originalAmount: entry.amount ?? 0,
          refundAmount: entry.amount ?? 0,
          refundStatus: RefundStatus.Pending,
          voidedAt: now,
        },
      }));

      // Bulk void: scheduled → voided + ghi voidInfo { refundAmount, refundStatus: "pending" }
      // Atomic per entry: guard status = "scheduled" → entries đã void thì skip
      await this.entryRepo.bulkVoidEntries(items);
    }

    // Lambda sắp timeout → trả done=false, Step Function sẽ gọi lại
    return { drawId, done: false };
  }
}

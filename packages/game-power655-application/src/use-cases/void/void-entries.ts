/**
 * Use Case: Void Entries Batch (Power 6/55)
 *
 * Step 2 (loop) của Void Draw Step Function.
 * Pipeline: prepare-void → **void-entries** → dispatch-refunds → finalize-void
 *
 * Void tất cả entries của draw bị huỷ, xử lý nhiều batch trong 1 lần gọi Lambda.
 * Dừng sớm khi sắp hết thời gian Lambda (MAX_EXECUTION_MS) → Step Function gọi lại.
 *
 * CRASH-SAFE DESIGN:
 *   - getVoidableEntriesBatch chỉ query entries có status = scheduled
 *   - Entry đã void (status ≠ scheduled) tự động bị loại khỏi query → không bao giờ xử lý lại
 *   - Nếu Lambda crash giữa chừng, lần gọi tiếp chỉ xử lý entries chưa void
 *   - done = true khi getVoidableEntriesBatch trả về rỗng (không còn entries voidable)
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { generateId } from "@megawin/shared/utils";
import { EntryRepository } from "../../infras/repos/entry-repo";
import type { VoidContext } from "./types";
import type { EntryVoidInfo } from "@megawin/game-power655/entities";
import { RefundStatus } from "@megawin/game-power655/entities";

export interface VoidEntriesBatchResult {
  /** ID kỳ quay đang void. */
  drawId: string;
  /** true khi đã void hết tất cả entries của draw. */
  done: boolean;
}

/** Số entries mỗi batch gửi xuống bulkVoidEntries. */
const BATCH_SIZE = 500;

/**
 * Thời gian tối đa cho phép xử lý trong 1 lần gọi Lambda (13 phút).
 * Lambda timeout = 15 phút → dừng sớm 5 phút để có thời gian trả kết quả
 * và Step Function lên lịch lần gọi tiếp.
 */
const MAX_EXECUTION_MS = 12 * 60 * 1000;

/**
 * Void entries theo batch cho draw bị huỷ.
 *
 * Mỗi lần execute xử lý nhiều batch liên tiếp trong giới hạn thời gian.
 * Step Function gọi lặp lại cho đến khi done = true.
 *
 * @param input.drawId - ID kỳ quay cần void
 * @returns done = true nếu đã void hết, false nếu cần gọi tiếp
 */
export class VoidEntriesBatchUseCase extends InternalUseCase<VoidContext, VoidEntriesBatchResult> {
  private readonly entryRepo = new EntryRepository();

  protected async execute(input: VoidContext): Promise<VoidEntriesBatchResult> {
    const { drawId } = input;
    const startTime = Date.now();

    // ── Batch loop: void entries liên tiếp cho đến khi hết hoặc hết thời gian ──
    // Mỗi iteration: query batch → map → bulkVoid. Khi entries.length === 0 → done.
    while (Date.now() - startTime < MAX_EXECUTION_MS) {
      // Query chỉ entries status = scheduled. Entries đã void không xuất hiện ở đây.
      const entries = await this.entryRepo.getVoidableEntriesBatch(drawId, BATCH_SIZE);

      if (entries.length === 0) {
        return { drawId, done: true };
      }

      // Map sang { entryId, voidInfo } — business rule: refundAmount = amount,
      // refundStatus = pending, voidedAt = now (thời điểm xử lý batch này).
      // amount fallback 0 phòng trường hợp data migration thiếu field.
      const now = new Date();
      const items = entries.map((entry) => {
        return {
          entryId: entry.id,
          voidInfo: {
            originalAmount: entry.amount ?? 0,
            refundAmount: entry.amount ?? 0,
            refundStatus: RefundStatus.Pending,
            voidedAt: now,
            // UUIDv7 idempotency key — mọi entry void đều cần refund tenant.
            refundTx: generateId(),
          } satisfies EntryVoidInfo,
        };
      });

      // Atomic bulk operation: void toàn bộ batch trong 1 DB call.
      // Nếu fail giữa chừng → crash-safe nhờ status filter ở query kế tiếp.
      await this.entryRepo.bulkVoidEntries(items);
    }

    // Hết thời gian Lambda nhưng vẫn còn entries → trả done = false
    // để Step Function gọi lại lần tiếp theo.
    return { drawId, done: false };
  }
}

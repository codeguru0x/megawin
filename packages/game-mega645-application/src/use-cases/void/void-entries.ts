/**
 * Use Case: Void Entries Batch (Mega 6/45)
 *
 * Step 2 (loop) của Void Draw Step Function.
 * Xử lý nhiều batch trong 1 lần gọi Lambda, dừng sớm khi sắp hết thời gian.
 *
 * CRASH-SAFE: query chỉ entries status=scheduled → đã void thì tự skip.
 * done = true khi không còn entries voidable.
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { RefundStatus, type EntryVoidInfo } from "@megawin/game-mega645/entities";
import { EntryRepository } from "../../infras/repos/entry-repo";
import type { VoidContext } from "./types";

/**
 * Kết quả của 1 lần chạy VoidEntriesBatch.
 * Step Function dùng `done` để quyết định loop tiếp hay chuyển sang SyncTicketSummaries.
 */
export interface VoidEntriesBatchResult {
  /** ID kỳ quay đang được void. */
  drawId: string;
  /**
   * true = không còn entry voidable nào → Step Function chuyển sang bước tiếp.
   * false = còn entries chưa void → Step Function loop lại VoidEntries.
   */
  done: boolean;
}

/** Số entries tối đa xử lý trong 1 batch DB call. */
const BATCH_SIZE = 500;

/**
 * Thời gian tối đa 1 lần chạy Lambda được xử lý (ms).
 * Dừng sớm để tránh Lambda timeout, Step Function sẽ loop lại lần sau.
 */
const MAX_EXECUTION_MS = 10 * 60 * 1000;

export class VoidEntriesBatchUseCase extends InternalUseCase<VoidContext, VoidEntriesBatchResult> {
  private readonly entryRepo = new EntryRepository();

  protected async execute(input: VoidContext): Promise<VoidEntriesBatchResult> {
    const { drawId } = input;
    const startTime = Date.now();

    // Loop xử lý nhiều batch trong 1 lần gọi Lambda để tối ưu throughput.
    // Dừng sớm khi sắp hết MAX_EXECUTION_MS để tránh Lambda timeout.
    while (Date.now() - startTime < MAX_EXECUTION_MS) {
      // Query chỉ entries status=scheduled → idempotent khi retry (đã void thì tự skip).
      const entries = await this.entryRepo.getVoidableEntriesBatch(drawId, BATCH_SIZE);

      if (entries.length === 0) {
        return { drawId, done: true };
      }

      const now = new Date();
      const items = entries.map((entry) => ({
        entryId: entry.id,
        voidInfo: {
          // originalAmount = số tiền cược gốc để audit. Dùng 0 nếu entry thiếu amount (dữ liệu lỗi).
          originalAmount: entry.amount ?? 0,
          // refundAmount = 100% tiền cược theo quy định Mega 6/45.
          // Void draw → hoàn toàn bộ, không trừ phí.
          refundAmount: entry.amount ?? 0,
          refundStatus: RefundStatus.Pending,
          voidedAt: now,
        } satisfies EntryVoidInfo,
      }));

      await this.entryRepo.bulkVoidEntries(items);
    }

    // Hết thời gian nhưng còn entries → báo done=false để Step Function loop lại.
    return { drawId, done: false };
  }
}

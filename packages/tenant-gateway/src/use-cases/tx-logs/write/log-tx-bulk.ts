/**
 * LogTxBulkUseCase — upsert N docs `tx_logs` cho 1 batch transaction.
 *
 * Dùng bởi `transaction-api.ts` sau khi `batchTransaction()` nhận response
 * hoặc bắt exception. N items trong batch → N docs, mỗi doc keyed theo `tx`
 * của item. Chung `batchId` + chung `createdAt` (stamp 1 lần cho cả lô) để
 * UI sort newest-first giữ đúng thứ tự items trong batch.
 *
 * ## Ngữ nghĩa "attempt cuối cùng"
 *
 * Retry lại cùng `tx` (dispatch loop gửi item fail ở batch tiếp) → upsert
 * overwrite doc cũ, không append. Staff chỉ cần kết quả mới nhất.
 *
 * Fire-and-forget: caller invoke qua `void useCase.run(inputs)`. Repo method
 * `upsertLogs` dùng `bulkWrite` với `ordered: false` — 1 item lỗi không block
 * các items còn lại; mọi lỗi được swallow ở repo + console.error.
 *
 * Pipeline position: cross-cutting write-side, invoke từ HTTP infrastructure.
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";

import type { TxLogInput } from "../../../entities";
import { TxLogRepository } from "../../../infras/repos";
import { buildTxLogInsertDoc } from "../../../shared/tx-log-serializer";

/** Input: mảng `TxLogInput` bỏ `createdAt` — use case stamp 1 lần cho cả lô. */
export type LogTxBulkInput = Array<Omit<TxLogInput, "createdAt">>;

/**
 * Fire-and-forget upsert N docs cho batch transaction (cùng `batchId`).
 *
 * Empty input → no-op (skip hẳn DB call). Caller PHẢI invoke bằng
 * `void useCase.run(inputs)` để không block main flow.
 */
export class LogTxBulkUseCase extends InternalUseCase<LogTxBulkInput, void> {
  private readonly repo = new TxLogRepository();

  protected async execute(inputs: LogTxBulkInput): Promise<void> {
    if (inputs.length === 0) {
      return;
    }

    const createdAt = new Date();
    const docs = inputs.map((input) => buildTxLogInsertDoc(input, createdAt));
    await this.repo.upsertLogs(docs);
  }
}

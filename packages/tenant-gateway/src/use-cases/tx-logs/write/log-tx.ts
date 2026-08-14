/**
 * LogTxUseCase — upsert 1 doc `tx_logs` cho 1 transaction đơn lẻ.
 *
 * Dùng bởi `transaction-api.ts` ngay sau khi nhận response hoặc bắt exception
 * từ tenant API. Caller invoke qua `void logTxUseCase.run(input).catch(...)`
 * hoặc wrap trong `void` — use case **KHÔNG throw** vì repo đã swallow lỗi.
 * Mục tiêu: logging không bao giờ block main business flow.
 *
 * ## Ngữ nghĩa "attempt cuối cùng"
 *
 * 1 `tx` → 1 doc. Retry cùng `tx` → upsert overwrite. Staff chỉ cần biết kết
 * quả mới nhất — lịch sử các attempt trước nằm ở `tenant_dispatch_orders`.
 *
 * Pipeline position: cross-cutting write-side, invoke từ HTTP infrastructure.
 */

import { UseCase } from "@megawin/app-core/use-cases";

import type { TxLogInput } from "../../../entities";
import { TxLogRepository } from "../../../infras/repos";
import { buildTxLogInsertDoc } from "../../../shared/tx-log-serializer";

/** Input: `TxLogInput` bỏ `createdAt` — use case tự stamp = `new Date()`. */
export type LogTxInput = Omit<TxLogInput, "createdAt">;

/**
 * Fire-and-forget upsert 1 doc cho single transaction.
 *
 * Caller PHẢI invoke bằng `void useCase.run(input)` để không block. Repo
 * method `upsertLog` tự swallow errors + console.error.
 */
export class LogTxUseCase extends UseCase<LogTxInput, void> {
  private readonly repo = new TxLogRepository();

  protected async execute(input: LogTxInput): Promise<void> {
    const doc = buildTxLogInsertDoc(input, new Date());
    await this.repo.upsertLog(doc);
  }
}

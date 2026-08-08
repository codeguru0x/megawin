/**
 * BO use case — list tất cả tx logs cùng `batchId` (paginated).
 *
 * Click vào `batchId` ở detail page → trang riêng list N items của batch đó.
 * Dùng `listLogs(filter.batchId)` → tận dụng index `batchId`.
 */

import { NextApiUseCase } from "@megawin/next/server";
import { APP_ERROR_CODES, AppException } from "@megawin/shared/errors";
import { Pagination } from "@megawin/shared/constants/pagination";

import type { TxLogEntity } from "../../entities/tx-log";
import { TxLogRepository, type ListTxLogsResult } from "../../infras/repos";

export interface ListTxLogsByBatchInput {
  batchId: string;
  limit?: number;
  cursor?: string;
}

export interface ListTxLogsByBatchOutput {
  data: TxLogEntity[];
  nextCursor: { createdAt: string; id: string } | null;
}

export class ListTxLogsByBatchUseCase extends NextApiUseCase<ListTxLogsByBatchInput, ListTxLogsByBatchOutput> {
  private readonly repo = new TxLogRepository();

  protected async execute(input: ListTxLogsByBatchInput): Promise<ListTxLogsByBatchOutput> {
    if (!input.batchId) {
      throw new AppException(APP_ERROR_CODES.VALIDATION, "Thiếu `batchId`");
    }
    const limit = this.normalizeLimit(input.limit);
    const cursor = this.parseCursor(input.cursor);

    const result = await this.repo.listLogs({ batchId: input.batchId }, { limit, cursor });
    return this.toOutput(result);
  }

  private normalizeLimit(raw: number | undefined): number {
    const size = raw ?? Pagination.Default.Size;
    if (!Number.isFinite(size) || size <= 0) return Pagination.Default.Size;
    return Math.min(size, Pagination.Max.Size);
  }

  private parseCursor(raw: string | undefined): { createdAt: Date; id: string } | null {
    if (!raw) return null;
    const [iso, id] = raw.split("|");
    if (!iso || !id) return null;
    const createdAt = new Date(iso);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id };
  }

  private toOutput(result: ListTxLogsResult): ListTxLogsByBatchOutput {
    return { data: result.data, nextCursor: result.nextCursor };
  }
}

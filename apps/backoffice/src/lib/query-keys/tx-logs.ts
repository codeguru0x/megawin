import { MODULES } from "./modules";

const MODULE = MODULES.txLogs;

/**
 * Query keys cho trang "Nhật ký giao dịch" (transactions/api-logs).
 *
 * - `list(filters)` — trang list có filter (tx | range + status + eventType).
 * - `byTx(tx)` — detail 1 transaction.
 * - `byBatch(batchId, cursor?)` — list items trong 1 batch (paginated).
 */
export const txLogsKeys = {
  all: [MODULE] as const,

  list: (filters: { tx?: string; from?: string; to?: string; status?: string; eventType?: string; cursor?: string }) =>
    [MODULE, "list", filters] as const,

  byTx: (tx: string) => [MODULE, "tx", tx] as const,

  byBatch: (batchId: string, cursor?: string) => [MODULE, "batch", batchId, cursor ?? null] as const,

  summary: (filters: { from: string; to: string }) => [MODULE, "summary", filters] as const,
};

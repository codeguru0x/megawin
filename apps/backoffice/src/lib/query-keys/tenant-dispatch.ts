import { MODULES } from "./modules";

const MODULE = MODULES.tenantDispatch;

/**
 * Query keys cho trang "Nhật ký Dispatch" (transactions/dispatch).
 *
 * - `list(filters)` — main list view với filter đa chiều.
 * - `summary(filters)` — KPI strip counts/amounts theo range.
 * - `byTx(tx)` — detail 1 order cho drawer.
 * - `batchProgress(batchKey)` — tiến độ 1 batch (sub-page).
 * - `byBatch(batchKey, filters)` — orders trong 1 batch (reuse list table).
 */
export const tenantDispatchKeys = {
  all: [MODULE] as const,

  list: (filters: {
    tx?: string;
    batchKey?: string;
    accountId?: string;
    username?: string;
    tenantId?: string;
    gameId?: string;
    status?: string;
    sourceKind?: string;
    retryMode?: string;
    stuckMinRetry?: number;
    from?: string;
    to?: string;
  }) => [MODULE, "list", filters] as const,

  summary: (filters: {
    tenantId?: string;
    gameId?: string;
    batchKey?: string;
    from?: string;
    to?: string;
    stuckMinRetry?: number;
  }) => [MODULE, "summary", filters] as const,

  byTx: (tx: string) => [MODULE, "tx", tx] as const,

  batchProgress: (batchKey: string) => [MODULE, "batch-progress", batchKey] as const,

  facets: (filters: { from?: string; to?: string }) => [MODULE, "facets", filters] as const,
};

/**
 * Types cho DispatchOrderRepository — các shape query/aggregate.
 *
 * Entity types (`TenantDispatchOrderDoc`, `TenantDispatchOrderEntity`) đã ở entities layer.
 * File này chỉ chứa aggregate/query result types riêng cho repo.
 */

import type { Currency, TransactionAction, TransactionReason } from "@megawin/shared/types";

import type { TenantDispatchOrderEntity } from "../../../entities/dispatch-order";
import type { DispatchOrderStatus, DispatchSourceKind } from "../../../entities/enums";

// ─────────────────────────────────────────────
// Pending batch — worker polling
// ─────────────────────────────────────────────

/**
 * Order ở trạng thái sẵn sàng dispatch — subset fields worker cần.
 *
 * Worker query `getPendingBatch` trả về shape này. Bỏ các field không cần thiết
 * cho dispatch loop (createdAt, updatedAt, ...).
 */
export interface PendingDispatchOrder {
  id: string;
  tx: string;
  tenantId: string;
  accountId: string;
  username: string;
  action: TransactionAction;
  reason: TransactionReason;
  amount: number;
  currency: Currency;
  force?: boolean;
  gameId: string;
  roundIds?: string[];
  description?: string;
  metadata?: Record<string, unknown>;
  sourceKind: DispatchSourceKind;
  sourceId: string;
  batchKey: string;
  retryCount?: number;
}

// ─────────────────────────────────────────────
// Batch progress — BO monitoring
// ─────────────────────────────────────────────

/**
 * Tổng hợp tiến độ của 1 `batchKey`. Dùng cho BO view "Batch progress".
 *
 * Aggregate `$group by status` + compute min/max timestamps.
 *
 * KHÔNG có field `failed` — với retry vô hạn, orders failed vẫn `Pending`.
 * BO dùng `listStuck` để thấy orders đang retry nhiều.
 */
export interface BatchProgress {
  batchKey: string;
  total: number;
  pending: number;
  dispatched: number;
  cancelled: number;
  /** Thời điểm order đầu tiên trong batch được tạo. */
  firstCreatedAt?: Date;
  /** Thời điểm dispatch gần nhất (order mới nhất hoàn tất). */
  lastDispatchedAt?: Date;
  /** Tổng amount của các orders đã dispatched. */
  dispatchedAmount: number;
}

// ─────────────────────────────────────────────
// List by source — BO reverse lookup
// ─────────────────────────────────────────────

/** Filter cho `listBySource`. */
export interface ListBySourceFilter {
  gameId: string;
  sourceKind: DispatchSourceKind;
  sourceId: string;
  status?: DispatchOrderStatus;
  limit?: number;
  skip?: number;
}

// ─────────────────────────────────────────────
// Stuck orders — BO monitoring
// ─────────────────────────────────────────────

/**
 * Filter cho `listStuck`. Staff dùng để monitor orders đang retry nhiều lần.
 *
 * Filter base: `status = Pending AND retryCount >= minRetryCount`.
 */
export interface ListStuckFilter {
  /** Ngưỡng tối thiểu `retryCount`. Mặc định `RETRY_ALERT_THRESHOLD`. */
  minRetryCount?: number;
  /** Filter theo tenant cụ thể (optional). */
  tenantId?: string;
  limit?: number;
  skip?: number;
}

// ─────────────────────────────────────────────
// List with cursor — BO main list view
// ─────────────────────────────────────────────

/**
 * Mode phân loại theo `retryCount` cho BO list filter.
 *
 * Đây là **khái niệm BO-only** — document không lưu field `retryMode`, chỉ lưu
 * `retryCount: number | undefined`. Filter build query dựa trên `retryCount` + scope
 * về `status: Pending` (orders đã Dispatched/Cancelled không còn "retry" dù retryCount > 0).
 *
 * - `fresh`: order mới, chưa từng thử dispatch (`retryCount` missing).
 * - `retrying`: đã fail 1 → `stuckMinRetry - 1` lần, worker vẫn đang backoff retry.
 * - `stuck`: vượt ngưỡng alert (default `RETRY_ALERT_THRESHOLD = 50`) — cần ops can thiệp.
 */
export type DispatchRetryMode = "fresh" | "retrying" | "stuck";

/**
 * Filter cho `listWithCursor` — BO main list view.
 *
 * Hỗ trợ mix-match nhiều dimension: tenant, game, status, sourceKind,
 * retryMode, batchKey, date range, và identity fields (accountId, username)
 * cho universal search. Cursor pagination FIFO theo
 * `createdAt DESC` + `_id` tie-break.
 */
export interface ListDispatchOrdersFilter {
  /**
   * Idempotency key — universal search by tx.
   *
   * Exact match trên `tx` (unique index). Khi set, các filter khác (status,
   * date range, retryMode, …) bị caller auto-bypass để tránh match rỗng.
   */
  tx?: string;
  tenantId?: string;
  gameId?: string;
  status?: DispatchOrderStatus;
  sourceKind?: DispatchSourceKind;
  /** Lọc theo phân vùng retry. */
  retryMode?: DispatchRetryMode;
  /**
   * Ngưỡng `retryCount` cho `retryMode = "stuck"` (override `RETRY_ALERT_THRESHOLD`).
   * Khi `retryMode != "stuck"`, ignore.
   */
  stuckMinRetry?: number;
  /** Preset theo batch — reuse cho page `/batches/[batchKey]`. */
  batchKey?: string;
  /**
   * MegaWin account ID (ULID) — universal search by account.
   *
   * Exact match. Không unique nhưng selective — mỗi account có N orders.
   */
  accountId?: string;
  /**
   * MegaWin username (`playerId@tenantId`) — universal search by player.
   *
   * Exact match lowercase. Staff phải gõ đầy đủ `username` vì `playerId`
   * không unique cross-tenant.
   */
  username?: string;
  /** `createdAt >= from`. */
  from?: Date;
  /** `createdAt <= to`. */
  to?: Date;
  /** Cursor từ page trước — sort `{ createdAt: -1, _id: -1 }`. */
  cursor?: { createdAt: Date; id: string } | null;
  limit: number;
}

/** Kết quả từ `listWithCursor` — data + nextCursor string-safe cho JSON. */
export interface ListDispatchOrdersResult {
  data: TenantDispatchOrderEntity[];
  nextCursor: { createdAt: string; id: string } | null;
}

// ─────────────────────────────────────────────
// Summary aggregate — BO KPI strip
// ─────────────────────────────────────────────

/**
 * Filter cho `aggregateSummary` — subset của `ListDispatchOrdersFilter`.
 *
 * KHÔNG chịu ảnh hưởng `status` / `sourceKind` / `retryMode` — KPI luôn
 * phản ánh toàn bộ range để staff thấy tổng quan; FE tự cross-reference.
 */
export interface DispatchSummaryFilter {
  tenantId?: string;
  gameId?: string;
  batchKey?: string;
  from?: Date;
  to?: Date;
  /** Ngưỡng stuck — default `RETRY_ALERT_THRESHOLD`. */
  stuckMinRetry?: number;
}

/**
 * Summary của 1 query range cho KPI strip.
 *
 * `retrying` + `stuck` + (`pending - retrying - stuck`) = `pending`:
 * - `retrying`: pending + `retryCount >= 1 AND < stuckMinRetry`.
 * - `stuck`: pending + `retryCount >= stuckMinRetry`.
 * - Phần còn lại = pending fresh (chưa fail lần nào).
 */
export interface DispatchSummary {
  total: number;
  pending: number;
  dispatched: number;
  cancelled: number;
  /** Pending đang retry (dưới ngưỡng stuck). */
  retrying: number;
  /** Pending đã vượt ngưỡng stuck — cần can thiệp. */
  stuck: number;
  /** Tổng `amount` tất cả orders trong range (VND). */
  totalAmount: number;
  /** Tổng `amount` các orders đã `Dispatched` (VND). */
  dispatchedAmount: number;
}

// ─────────────────────────────────────────────
// Facets — distinct dimension values trong range
// ─────────────────────────────────────────────

/**
 * Filter cho `aggregateFacets` — chỉ cần range (và optional tenant/game để
 * cross-filter). KHÔNG chịu ảnh hưởng `status`/`retryMode` — facets luôn
 * trả về distinct tenant/game trong toàn bộ range để Staff chọn filter.
 */
export interface DispatchFacetsFilter {
  from?: Date;
  to?: Date;
}

/**
 * Kết quả distinct dimension + count cho filter dropdown.
 *
 * Dùng cho Combobox "Tenant" — chỉ hiện tenants có orders trong range,
 * sort theo count DESC để tenant nhiều orders nhất lên đầu.
 */
export interface DispatchFacetValue {
  value: string;
  count: number;
}

export interface DispatchFacets {
  tenants: DispatchFacetValue[];
  games: DispatchFacetValue[];
}
